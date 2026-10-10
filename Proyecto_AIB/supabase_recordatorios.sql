-- ============================================================================
-- AIB+ — Recordatorios y reseñas con enlace
-- ============================================================================
-- CallMeBot solo le escribe al dueño de cada clave (el administrador o el
-- ingeniero que la activó), no a los clientes. Por eso:
--   - al ingeniero le llegan sus recordatorios por WhatsApp a las 8:00, con el
--     mensaje ya escrito para su cliente, y los ve también en «Hoy»;
--   - él se lo manda al cliente desde su WhatsApp con un toque.
--
--   1. Reseña con enlace: /resena/<token>, sin cuenta. El cliente pone sus
--      estrellas y un comentario desde el WhatsApp de su ingeniero, aunque no
--      vuelva al navegador donde hizo su proyecto.
--   2. Recordatorios (recordatorios_del_dia para el cron, mis_recordatorios
--      para el panel):
--        - pedir reseña: el proyecto lleva 2 días «Publicada» y sin reseña;
--        - propuesta por vencer: vence mañana y el cliente no respondió;
--        - plan por vencer: al ingeniero, 3 días antes y el día que vence
--          (y al administrador, la lista de todos).
--
-- Ejecutar después de supabase_propuestas.sql y supabase_planes.sql. Se
-- puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enlaces de reseña
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enlaces_resena (
  proyecto_id UUID PRIMARY KEY REFERENCES public.proyectos (id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solo se leen y escriben con las funciones de abajo.
ALTER TABLE public.enlaces_resena ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enlaces_resena FROM anon, authenticated;

-- La etapa en la que está un encargo ('recibido' si nadie la cambió).
CREATE OR REPLACE FUNCTION public.etapa_actual(p_proyecto UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT se.estado FROM public.seguimiento_encargos se
    WHERE se.proyecto_id = p_proyecto
    ORDER BY se.created_at DESC, se.id DESC
    LIMIT 1
  ), 'recibido');
$$;

REVOKE ALL ON FUNCTION public.etapa_actual(UUID) FROM PUBLIC, anon, authenticated;

-- El enlace de un proyecto; lo crea la primera vez.
CREATE OR REPLACE FUNCTION public.token_resena(p_proyecto UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token TEXT;
BEGIN
  INSERT INTO public.enlaces_resena (proyecto_id) VALUES (p_proyecto) ON CONFLICT (proyecto_id) DO NOTHING;
  SELECT token INTO v_token FROM public.enlaces_resena WHERE proyecto_id = p_proyecto;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.token_resena(UUID) FROM PUBLIC, anon, authenticated;

-- El ingeniero del encargo (o el dueño de su equipo) pide el enlace para
-- mandárselo a su cliente. Solo cuando ya está «Publicada».
CREATE OR REPLACE FUNCTION public.enlace_resena(p_proyecto UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
  v_resena    JSONB;
BEGIN
  SELECT ingeniero_id INTO v_ingeniero FROM public.proyectos WHERE id = p_proyecto AND payload->>'aceptado' = 'true';
  IF v_ingeniero IS NULL OR NOT public.es_ingeniero()
     OR NOT COALESCE(v_ingeniero = auth.uid() OR v_ingeniero = public.dueno_de_mi_equipo(), false) THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT jsonb_build_object('estrellas', r.estrellas, 'comentario', r.comentario) INTO v_resena
  FROM public.resenas r WHERE r.proyecto_id = p_proyecto;
  IF v_resena IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'ya_resenada', 'resena', v_resena);
  END IF;

  IF public.etapa_actual(p_proyecto) <> 'publicada' THEN
    RETURN jsonb_build_object('estado', 'no_publicada');
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'token', public.token_resena(p_proyecto));
END;
$$;

REVOKE ALL ON FUNCTION public.enlace_resena(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enlace_resena(UUID) TO authenticated;

-- La página de la reseña (sin cuenta). Nada privado: el nombre de pila del
-- cliente, su negocio y quién lo construyó.
CREATE OR REPLACE FUNCTION public.resena_por_token(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', COALESCE(p.payload->'ficha'->>'empresa', p.payload->>'servicio'),
    'cliente', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
    'tipo_servicio', p.payload->>'tipo_servicio',
    'ingeniero', jsonb_build_object(
      'nombre', COALESCE(pi.nombre, 'AIB+'),
      'foto_url', pi.foto_url,
      'slug', CASE WHEN pi.estado = 'aprobado' THEN pi.slug END
    ),
    'publicada', public.etapa_actual(p.id) = 'publicada',
    'resena', (SELECT jsonb_build_object('estrellas', r.estrellas, 'comentario', r.comentario)
               FROM public.resenas r WHERE r.proyecto_id = p.id)
  )
  FROM public.enlaces_resena e
  JOIN public.proyectos p ON p.id = e.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = p.ingeniero_id
  WHERE e.token = p_token AND p.payload->>'aceptado' = 'true';
$$;

REVOKE ALL ON FUNCTION public.resena_por_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resena_por_token(TEXT) TO anon, authenticated;

-- El cliente deja su reseña con el enlace. Una por proyecto, como la de la
-- app; su ingeniero (con su sesión abierta) no puede calificarse a sí mismo.
CREATE OR REPLACE FUNCTION public.dejar_resena_por_token(p_token TEXT, p_estrellas INTEGER, p_comentario TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proyecto  UUID;
  v_cliente   UUID;
  v_ingeniero UUID;
BEGIN
  SELECT p.id, p.user_id, p.ingeniero_id INTO v_proyecto, v_cliente, v_ingeniero
  FROM public.enlaces_resena e
  JOIN public.proyectos p ON p.id = e.proyecto_id
  WHERE e.token = p_token AND p.payload->>'aceptado' = 'true';

  IF v_proyecto IS NULL OR v_ingeniero IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF auth.uid() IS NOT NULL
     AND COALESCE(auth.uid() = v_ingeniero OR v_ingeniero = public.dueno_de_mi_equipo(), false) THEN
    RETURN jsonb_build_object('estado', 'propia');
  END IF;
  IF public.etapa_actual(v_proyecto) <> 'publicada' THEN
    RETURN jsonb_build_object('estado', 'no_publicada');
  END IF;
  IF p_estrellas IS NULL OR p_estrellas NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('estado', 'invalida');
  END IF;

  INSERT INTO public.resenas (proyecto_id, ingeniero_id, cliente_id, estrellas, comentario)
  VALUES (v_proyecto, v_ingeniero, v_cliente, p_estrellas, left(btrim(COALESCE(p_comentario, '')), 600))
  ON CONFLICT (proyecto_id) DO NOTHING;

  RETURN jsonb_build_object('estado', CASE WHEN FOUND THEN 'ok' ELSE 'ya_existe' END);
END;
$$;

REVOKE ALL ON FUNCTION public.dejar_resena_por_token(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dejar_resena_por_token(TEXT, INTEGER, TEXT) TO anon, authenticated;

-- Para la tarjeta de WhatsApp del enlace.
CREATE OR REPLACE FUNCTION public.vista_previa_resena(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', COALESCE(p.payload->'ficha'->>'empresa', p.payload->>'servicio'),
    'ingeniero', split_part(COALESCE(pi.nombre, 'AIB+'), ' ', 1)
  )
  FROM public.enlaces_resena e
  JOIN public.proyectos p ON p.id = e.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = p.ingeniero_id
  WHERE e.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.vista_previa_resena(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vista_previa_resena(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Recordatorios
-- ----------------------------------------------------------------------------
-- Lo que se le pide al cliente: nombre de pila y WhatsApp (solo dígitos).
CREATE OR REPLACE FUNCTION public.contacto_de(p_payload JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', COALESCE(p_payload->'ficha'->>'empresa', p_payload->>'servicio'),
    'cliente', NULLIF(split_part(btrim(COALESCE(p_payload->'contacto'->>'nombre', '')), ' ', 1), ''),
    'whatsapp', NULLIF(regexp_replace(COALESCE(p_payload->'contacto'->>'whatsapp', ''), '[^0-9]', '', 'g'), '')
  );
$$;

REVOKE ALL ON FUNCTION public.contacto_de(JSONB) FROM PUBLIC, anon, authenticated;

-- Para el cron de las 8:00 (CRON_SECRET). Solo lo que toca HOY, para no
-- repetir el mismo aviso cada mañana:
--   - reseñas: «Publicada» hace exactamente 2 días y sin reseña;
--   - propuestas: vencen mañana y siguen sin respuesta;
--   - plan: vence en 3 días o hoy.
CREATE OR REPLACE FUNCTION public.recordatorios_del_dia(p_clave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy DATE := public.hoy_lima();
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  -- Los enlaces de las reseñas que toca pedir hoy.
  PERFORM public.token_resena(p.id)
  FROM public.proyectos p
  JOIN LATERAL (
    SELECT se.estado, se.created_at FROM public.seguimiento_encargos se
    WHERE se.proyecto_id = p.id ORDER BY se.created_at DESC, se.id DESC LIMIT 1
  ) e ON true
  WHERE p.ingeniero_id IS NOT NULL
    AND e.estado = 'publicada'
    AND (e.created_at AT TIME ZONE 'America/Lima')::date = v_hoy - 2
    AND NOT EXISTS (SELECT 1 FROM public.resenas r WHERE r.proyecto_id = p.id);

  RETURN jsonb_build_object(
    'estado', 'ok',
    'destinatarios', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT
          pf.user_id AS id,
          pf.es_admin,
          COALESCE(NULLIF(btrim(aj.nombre), ''), split_part(pi.nombre, ' ', 1)) AS nombre,
          NULLIF(regexp_replace(COALESCE(pi.whatsapp, ''), '[^0-9]', '', 'g'), '') AS whatsapp,
          a.callmebot_apikey AS apikey,
          (
            SELECT jsonb_build_object(
              'plan', s.plan,
              'vence_en', s.vence_en,
              'dias', (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy
            )
            FROM public.suscripciones s
            WHERE s.user_id = pf.user_id AND s.plan IN ('pro', 'negocio')
              AND (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy IN (3, 0)
          ) AS plan,
          (
            SELECT COALESCE(jsonb_agg(public.contacto_de(p.payload) || jsonb_build_object('token', pr.token)), '[]'::jsonb)
            FROM public.propuestas pr
            JOIN public.proyectos p ON p.id = pr.proyecto_id
            WHERE pr.ingeniero_id = pf.user_id AND pr.estado = 'enviada' AND pr.valida_hasta = v_hoy + 1
          ) AS propuestas,
          (
            SELECT COALESCE(jsonb_agg(public.contacto_de(p.payload) || jsonb_build_object('token', er.token)), '[]'::jsonb)
            FROM public.proyectos p
            JOIN public.enlaces_resena er ON er.proyecto_id = p.id
            JOIN LATERAL (
              SELECT se.estado, se.created_at FROM public.seguimiento_encargos se
              WHERE se.proyecto_id = p.id ORDER BY se.created_at DESC, se.id DESC LIMIT 1
            ) e ON true
            WHERE p.ingeniero_id = pf.user_id
              AND e.estado = 'publicada'
              AND (e.created_at AT TIME ZONE 'America/Lima')::date = v_hoy - 2
              AND NOT EXISTS (SELECT 1 FROM public.resenas r WHERE r.proyecto_id = p.id)
          ) AS resenas,
          -- Al administrador: los planes de todos que vencen en 3 días o hoy.
          CASE WHEN pf.es_admin THEN (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'nombre', COALESCE(pi2.nombre, 'Un ingeniero'),
              'plan', s.plan,
              'dias', (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy
            )), '[]'::jsonb)
            FROM public.suscripciones s
            LEFT JOIN public.perfiles_ingeniero pi2 ON pi2.user_id = s.user_id
            WHERE s.plan IN ('pro', 'negocio')
              AND (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy IN (3, 0)
          ) ELSE '[]'::jsonb END AS planes_de_otros
        FROM public.perfiles pf
        LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pf.user_id
        LEFT JOIN public.avisos_ingeniero a ON a.user_id = pf.user_id
        LEFT JOIN public.ajustes_ingeniero aj ON aj.user_id = pf.user_id
        WHERE pf.rol = 'ingeniero' AND (pf.es_admin OR pi.estado IN ('aprobado', 'pausado'))
      ) d
      WHERE d.plan IS NOT NULL OR d.propuestas <> '[]'::jsonb OR d.resenas <> '[]'::jsonb
         OR d.planes_de_otros <> '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recordatorios_del_dia(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recordatorios_del_dia(TEXT) TO anon, authenticated;

-- Para «Hoy» en el panel: lo pendiente del ingeniero (y de su equipo), no
-- solo lo de hoy.
--   - reseñas por pedir: «Publicada» en los últimos 30 días y sin reseña;
--   - propuestas que vencen hoy o mañana y siguen sin respuesta;
--   - su plan, si vence en 3 días o menos.
CREATE OR REPLACE FUNCTION public.mis_recordatorios()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hoy    DATE := public.hoy_lima();
  v_yo     UUID := auth.uid();
  v_duenio UUID := public.dueno_de_mi_equipo();
BEGIN
  IF v_yo IS NULL OR NOT public.es_ingeniero() THEN
    RETURN jsonb_build_object('estado', 'no_ingeniero');
  END IF;

  PERFORM public.token_resena(p.id)
  FROM public.proyectos p
  JOIN LATERAL (
    SELECT se.estado, se.created_at FROM public.seguimiento_encargos se
    WHERE se.proyecto_id = p.id ORDER BY se.created_at DESC, se.id DESC LIMIT 1
  ) e ON true
  WHERE (p.ingeniero_id = v_yo OR p.ingeniero_id = v_duenio)
    AND e.estado = 'publicada'
    AND e.created_at > now() - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM public.resenas r WHERE r.proyecto_id = p.id);

  RETURN jsonb_build_object(
    'estado', 'ok',
    'plan', (
      SELECT jsonb_build_object(
        'plan', s.plan,
        'vence_en', s.vence_en,
        'dias', (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy
      )
      FROM public.suscripciones s
      WHERE s.user_id = v_yo AND s.plan IN ('pro', 'negocio')
        AND (s.vence_en AT TIME ZONE 'America/Lima')::date - v_hoy BETWEEN 0 AND 3
    ),
    'resenas', (
      SELECT COALESCE(jsonb_agg(
        public.contacto_de(p.payload)
          || jsonb_build_object('proyecto_id', p.id, 'token', er.token, 'publicada_en', e.created_at)
        ORDER BY e.created_at
      ), '[]'::jsonb)
      FROM public.proyectos p
      JOIN public.enlaces_resena er ON er.proyecto_id = p.id
      JOIN LATERAL (
        SELECT se.estado, se.created_at FROM public.seguimiento_encargos se
        WHERE se.proyecto_id = p.id ORDER BY se.created_at DESC, se.id DESC LIMIT 1
      ) e ON true
      WHERE (p.ingeniero_id = v_yo OR p.ingeniero_id = v_duenio)
        AND e.estado = 'publicada'
        AND e.created_at > now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM public.resenas r WHERE r.proyecto_id = p.id)
    ),
    'propuestas', (
      SELECT COALESCE(jsonb_agg(
        public.contacto_de(p.payload)
          || jsonb_build_object('proyecto_id', p.id, 'token', pr.token, 'valida_hasta', pr.valida_hasta)
        ORDER BY pr.valida_hasta
      ), '[]'::jsonb)
      FROM public.propuestas pr
      JOIN public.proyectos p ON p.id = pr.proyecto_id
      WHERE (pr.ingeniero_id = v_yo OR pr.ingeniero_id = v_duenio)
        AND pr.estado = 'enviada'
        AND pr.valida_hasta BETWEEN v_hoy AND v_hoy + 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mis_recordatorios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_recordatorios() TO authenticated;
