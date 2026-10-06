-- ============================================================================
-- AIB+ — Avisos por WhatsApp a cada ingeniero
-- ============================================================================
-- Con varios ingenieros, el aviso de encargo nuevo y el resumen de la mañana
-- tienen que llegarle a quien lleva el encargo, no solo al administrador (que
-- ya los recibe con el WhatsApp configurado en el servidor).
--
-- Los avisos salen por CallMeBot, que exige que cada persona active su propio
-- número y obtenga una clave. Esa clave se guarda en avisos_ingeniero, que
-- nadie puede leer desde la app: solo el servidor, con la clave secreta que ya
-- usa el resumen diario (claves_sistema 'resumen_diario', CRON_SECRET).
--
-- Ejecutar después de supabase_marketplace.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.avisos_ingeniero (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  callmebot_apikey TEXT NOT NULL CHECK (callmebot_apikey ~ '^[A-Za-z0-9]{4,40}$'),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.avisos_ingeniero ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_ingeniero FROM anon, authenticated;

-- El ingeniero guarda (o borra, con NULL) su clave. Devuelve si quedó guardada.
CREATE OR REPLACE FUNCTION public.guardar_aviso_ingeniero(p_apikey TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clave TEXT := btrim(COALESCE(p_apikey, ''));
BEGIN
  IF auth.uid() IS NULL OR public.es_anonimo()
     OR NOT EXISTS (SELECT 1 FROM public.perfiles_ingeniero WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Primero arma tu perfil de ingeniero' USING ERRCODE = '42501';
  END IF;

  IF v_clave = '' THEN
    DELETE FROM public.avisos_ingeniero WHERE user_id = auth.uid();
    RETURN false;
  END IF;

  INSERT INTO public.avisos_ingeniero (user_id, callmebot_apikey) VALUES (auth.uid(), v_clave)
  ON CONFLICT (user_id) DO UPDATE SET callmebot_apikey = EXCLUDED.callmebot_apikey, actualizado_en = now();
  RETURN true;
END;
$$;

-- ¿Tiene los avisos listos? (clave guardada y WhatsApp en su perfil)
CREATE OR REPLACE FUNCTION public.tengo_aviso_ingeniero()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.avisos_ingeniero a
    JOIN public.perfiles_ingeniero pi ON pi.user_id = a.user_id
    WHERE a.user_id = auth.uid() AND pi.whatsapp IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.guardar_aviso_ingeniero(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tengo_aviso_ingeniero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_aviso_ingeniero(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tengo_aviso_ingeniero() TO authenticated;

-- ----------------------------------------------------------------------------
-- Solo para el servidor (con su clave secreta)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clave_servidor_valida(p_clave TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_clave IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.claves_sistema
    WHERE nombre = 'resumen_diario' AND huella = encode(sha256(convert_to(p_clave, 'UTF8')), 'hex')
  );
$$;

REVOKE ALL ON FUNCTION public.clave_servidor_valida(TEXT) FROM PUBLIC, anon, authenticated;

-- A quién avisar de un encargo recién aceptado: su ingeniero, si no es el
-- administrador (a él ya le avisa el WhatsApp del servidor) y tiene los avisos
-- listos. El servidor solo la llama después de registrar_aviso_encargo, así que
-- cada encargo avisa una vez.
CREATE OR REPLACE FUNCTION public.aviso_ingeniero_de_encargo(p_clave TEXT, p_proyecto UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fila JSONB;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  SELECT jsonb_build_object(
    'estado', 'ok',
    'nombre', split_part(pi.nombre, ' ', 1),
    'whatsapp', regexp_replace(pi.whatsapp, '[^0-9]', '', 'g'),
    'apikey', a.callmebot_apikey,
    'negocio', COALESCE(p.payload->'ficha'->>'empresa', p.payload->>'servicio')
  )
  INTO v_fila
  FROM public.proyectos p
  JOIN public.perfiles_ingeniero pi ON pi.user_id = p.ingeniero_id
  JOIN public.avisos_ingeniero a ON a.user_id = p.ingeniero_id
  WHERE p.id = p_proyecto
    AND p.payload->>'aceptado' = 'true'
    AND NOT public.es_admin_id(p.ingeniero_id)
    AND pi.whatsapp IS NOT NULL;

  RETURN COALESCE(v_fila, jsonb_build_object('estado', 'sin_canal'));
END;
$$;

-- Para el aviso de prueba que pide el propio ingeniero desde su perfil (el
-- servidor ya comprobó su sesión y pasa su id).
CREATE OR REPLACE FUNCTION public.aviso_de_prueba(p_clave TEXT, p_usuario UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fila JSONB;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  SELECT jsonb_build_object(
    'estado', 'ok',
    'nombre', split_part(pi.nombre, ' ', 1),
    'whatsapp', regexp_replace(pi.whatsapp, '[^0-9]', '', 'g'),
    'apikey', a.callmebot_apikey
  )
  INTO v_fila
  FROM public.perfiles_ingeniero pi
  JOIN public.avisos_ingeniero a ON a.user_id = pi.user_id
  WHERE pi.user_id = p_usuario AND pi.whatsapp IS NOT NULL;

  RETURN COALESCE(v_fila, jsonb_build_object('estado', 'sin_canal'));
END;
$$;

-- El resumen de la mañana de cada ingeniero que no es el administrador (el
-- suyo sale de resumen_del_dia): solo lo suyo, como en su panel.
CREATE OR REPLACE FUNCTION public.resumenes_ingenieros(p_clave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ayer TIMESTAMPTZ := now() - interval '1 day';
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  RETURN jsonb_build_object(
    'estado', 'ok',
    'ingenieros', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'nombre', COALESCE(NULLIF(btrim(aj.nombre), ''), split_part(pi.nombre, ' ', 1)),
        'whatsapp', regexp_replace(pi.whatsapp, '[^0-9]', '', 'g'),
        'apikey', a.callmebot_apikey,
        'esperando', (
          SELECT COALESCE(jsonb_agg(x ORDER BY x.desde), '[]'::jsonb) FROM (
            SELECT COALESCE(e.empresa, e.cliente, e.servicio) AS negocio,
                   COALESCE(e.aceptado_en::timestamptz, e.created_at) AS desde
            FROM public.encargos e
            WHERE e.ingeniero_id = pi.user_id AND e.estado = 'recibido' AND NOT e.es_prueba
            ORDER BY 2
            LIMIT 5
          ) x
        ),
        'total_esperando', (
          SELECT count(*) FROM public.encargos e
          WHERE e.ingeniero_id = pi.user_id AND e.estado = 'recibido' AND NOT e.es_prueba
        ),
        'encargos_nuevos_24h', (
          SELECT count(*) FROM public.encargos e
          WHERE e.ingeniero_id = pi.user_id AND NOT e.es_prueba
            AND COALESCE(e.aceptado_en::timestamptz, e.created_at) > v_ayer
        ),
        'invitaciones_a_medias', (
          SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
            SELECT r.negocio,
                   CASE
                     WHEN r.maqueta_en IS NOT NULL THEN 'vio su web, no aceptó'
                     WHEN r.empezada_en IS NOT NULL THEN 'empezó, no llegó a ver su web'
                     WHEN r.abierta_en IS NOT NULL THEN 'abrió el enlace, no empezó'
                     ELSE 'no abrió el enlace'
                   END AS donde
            FROM public.invitaciones i
            JOIN public.invitaciones_resumen r ON r.id = i.id
            WHERE i.ingeniero_id = pi.user_id AND i.origen = 'ingeniero'
              AND r.activa AND NOT r.es_prueba AND r.aceptada_en IS NULL
            ORDER BY r.created_at DESC
            LIMIT 3
          ) x
        ),
        'total_invitaciones_a_medias', (
          SELECT count(*) FROM public.invitaciones i
          JOIN public.invitaciones_resumen r ON r.id = i.id
          WHERE i.ingeniero_id = pi.user_id AND i.origen = 'ingeniero'
            AND r.activa AND NOT r.es_prueba AND r.aceptada_en IS NULL
        ),
        'comentarios_24h', (
          SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
            SELECT p.payload->'ficha'->>'empresa' AS negocio, c.reaccion, left(c.texto, 120) AS texto
            FROM public.comentarios c
            JOIN public.proyectos p ON p.id = c.proyecto_id
            WHERE c.created_at > v_ayer
              AND (
                p.ingeniero_id = pi.user_id
                OR EXISTS (
                  SELECT 1 FROM public.invitaciones i
                  WHERE i.cliente_id = p.user_id AND i.ingeniero_id = pi.user_id
                )
              )
            ORDER BY c.created_at DESC
            LIMIT 3
          ) x
        )
      )), '[]'::jsonb)
      FROM public.perfiles_ingeniero pi
      JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero' AND NOT pf.es_admin
      JOIN public.avisos_ingeniero a ON a.user_id = pi.user_id
      LEFT JOIN public.ajustes_ingeniero aj ON aj.user_id = pi.user_id
      WHERE pi.estado IN ('aprobado', 'pausado')
        AND pi.whatsapp IS NOT NULL
        AND COALESCE(aj.resumen_diario, true)
    )
  );
END;
$$;

-- Las tres se llaman con la clave pública y se protegen con la secreta, como
-- resumen_del_dia.
REVOKE ALL ON FUNCTION public.aviso_ingeniero_de_encargo(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aviso_de_prueba(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resumenes_ingenieros(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aviso_ingeniero_de_encargo(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aviso_de_prueba(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumenes_ingenieros(TEXT) TO anon, authenticated;
