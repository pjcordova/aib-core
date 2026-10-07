-- ============================================================================
-- AIB+ — Página pública de cada ingeniero (/ing/:slug)
-- ============================================================================
-- Cada ingeniero aprobado tiene una página propia para compartir: su perfil,
-- sus servicios, sus diseños (sin los premium) con precio y sus reseñas. Desde
-- ahí el cliente arma su web sin cuenta «con» ese ingeniero: es como si él lo
-- hubiera invitado (invitación con origen 'ingeniero' y canal 'perfil'), así
-- que ve solo sus diseños y el encargo le llega a él.
--
-- Ejecutar después de supabase_plantillas_propias.sql. Se puede ejecutar más
-- de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La dirección: /ing/kevin-diaz
-- ----------------------------------------------------------------------------
ALTER TABLE public.perfiles_ingeniero ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.perfiles_ingeniero DROP CONSTRAINT IF EXISTS perfiles_ingeniero_slug_check;
ALTER TABLE public.perfiles_ingeniero ADD CONSTRAINT perfiles_ingeniero_slug_check
  CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40));

CREATE UNIQUE INDEX IF NOT EXISTS perfiles_ingeniero_slug_idx ON public.perfiles_ingeniero (slug);

-- «Kevin Díaz Solier» → «kevin-diaz-solier».
CREATE OR REPLACE FUNCTION public.slug_de(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT left(
    btrim(regexp_replace(translate(lower(COALESCE(p_texto, '')), 'áéíóúüñàèìòùç', 'aeiouunaeiouc'), '[^a-z0-9]+', '-', 'g'), '-'),
    40
  );
$$;

-- Libre para ese usuario: si ya lo tiene otro, se le añade -2, -3…
CREATE OR REPLACE FUNCTION public.slug_libre(p_base TEXT, p_usuario UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_base TEXT := btrim(left(public.slug_de(p_base), 36), '-');
  v_slug TEXT;
  v_n    INTEGER := 1;
BEGIN
  IF char_length(v_base) < 3 THEN
    v_base := 'ingeniero';
  END IF;
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM public.perfiles_ingeniero WHERE slug = v_slug AND user_id <> p_usuario) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END;
$$;

CREATE OR REPLACE FUNCTION public.poner_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := public.slug_libre(NEW.nombre, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.poner_slug() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS poner_slug ON public.perfiles_ingeniero;
CREATE TRIGGER poner_slug
  BEFORE INSERT OR UPDATE ON public.perfiles_ingeniero
  FOR EACH ROW EXECUTE FUNCTION public.poner_slug();

-- Los que ya estaban.
UPDATE public.perfiles_ingeniero SET slug = public.slug_libre(nombre, user_id) WHERE slug IS NULL;

-- El ingeniero elige la suya. Devuelve {estado}: 'ok', 'invalido' u 'ocupado'.
CREATE OR REPLACE FUNCTION public.cambiar_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slug TEXT := public.slug_de(p_slug);
BEGIN
  IF char_length(v_slug) NOT BETWEEN 3 AND 40 THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfiles_ingeniero WHERE slug = v_slug AND user_id <> auth.uid()) THEN
    RETURN jsonb_build_object('estado', 'ocupado');
  END IF;
  UPDATE public.perfiles_ingeniero SET slug = v_slug, actualizado_en = now() WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  RETURN jsonb_build_object('estado', 'ok', 'slug', v_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_slug(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_slug(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Lo que muestra la página (también sin sesión)
-- ----------------------------------------------------------------------------
-- Solo de ingenieros aprobados. Nada de contacto: ni WhatsApp ni correo.
CREATE OR REPLACE FUNCTION public.perfil_publico(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', pi.user_id,
    'slug', pi.slug,
    'nombre', pi.nombre,
    'titular', pi.titular,
    'bio', pi.bio,
    'especialidades', to_jsonb(pi.especialidades),
    'servicios', to_jsonb(pi.servicios),
    'servicios_otros', to_jsonb(pi.servicios_otros),
    'anios_experiencia', pi.anios_experiencia,
    'ciudad', pi.ciudad,
    'portafolio_url', pi.portafolio_url,
    'foto_url', pi.foto_url,
    'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'publicadas', (
      SELECT count(*) FROM public.proyectos p
      WHERE p.ingeniero_id = pi.user_id
        AND (SELECT se.estado FROM public.seguimiento_encargos se WHERE se.proyecto_id = p.id
             ORDER BY se.created_at DESC, se.id DESC LIMIT 1) = 'publicada'
    ),
    'ultimas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'estrellas', r.estrellas,
        'comentario', r.comentario,
        -- Solo el nombre de pila de quien la escribió.
        'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
        'negocio', p.payload->'ficha'->>'empresa',
        'fecha', r.creada_en
      ) ORDER BY r.creada_en DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 10) r
      JOIN public.proyectos p ON p.id = r.proyecto_id
    ),
    'disenos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'tipo', t.tipo,
        'base', t.base,
        'nombre', t.nombre,
        'descripcion', t.descripcion,
        'categoria', t.categoria,
        'estilo', t.estilo,
        'etiquetas', to_jsonb(t.etiquetas),
        'nivel', t.nivel,
        'precio_desde', t.precio_desde,
        'color_primario', t.color_primario,
        'color_secundario', t.color_secundario,
        'html', t.html,
        'css', t.css,
        'fuentes', to_jsonb(t.fuentes)
      ) ORDER BY t.nivel, t.precio_desde NULLS LAST, t.created_at), '[]'::jsonb)
      FROM (
        SELECT * FROM public.plantillas
        WHERE ingeniero_id = pi.user_id AND activa AND nivel <> 'premium'
        ORDER BY created_at
        LIMIT 12
      ) t
    )
  )
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.perfil_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perfil_publico(TEXT) TO anon, authenticated;

-- Para la tarjeta del enlace en WhatsApp (el servidor, sin sesión).
CREATE OR REPLACE FUNCTION public.vista_previa_perfil(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('nombre', pi.nombre, 'titular', pi.titular)
  FROM public.perfiles_ingeniero pi
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.vista_previa_perfil(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vista_previa_perfil(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. «Quiero mi web con él»
-- ----------------------------------------------------------------------------
-- Con la sesión sin cuenta ya abierta. Devuelve {estado}: 'ok', 'no_anonimo',
-- 'no_existe', 'lleno' (tope diario de ese ingeniero) u 'otra' (ya tiene otra
-- prueba en marcha: que decida si empieza de nuevo).
CREATE OR REPLACE FUNCTION public.empezar_con_ingeniero(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario   UUID := auth.uid();
  v_ingeniero UUID;
  v_inv       public.invitaciones%ROWTYPE;
  v_hoy       TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
BEGIN
  IF v_usuario IS NULL OR NOT public.es_anonimo() THEN
    RETURN jsonb_build_object('estado', 'no_anonimo');
  END IF;

  SELECT pi.user_id INTO v_ingeniero
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
  IF v_ingeniero IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones WHERE cliente_id = v_usuario;
  IF v_inv.id IS NOT NULL THEN
    IF v_inv.ingeniero_id = v_ingeniero AND v_inv.origen = 'ingeniero' THEN
      RETURN jsonb_build_object('estado', 'ok');
    END IF;
    -- Una prueba de la portada que aún no empezó pasa a ser con él.
    IF v_inv.origen = 'portada' AND v_inv.empezada_en IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.proyectos WHERE user_id = v_usuario) THEN
      UPDATE public.invitaciones
      SET ingeniero_id = v_ingeniero, origen = 'ingeniero', canal = 'perfil'
      WHERE id = v_inv.id;
      RETURN jsonb_build_object('estado', 'ok');
    END IF;
    RETURN jsonb_build_object('estado', 'otra');
  END IF;

  -- Tope diario por ingeniero, de uno en uno.
  PERFORM pg_advisory_xact_lock(hashtext('aib-perfil-' || v_ingeniero::text));
  IF (
    SELECT count(*) FROM public.invitaciones
    WHERE ingeniero_id = v_ingeniero AND canal = 'perfil' AND created_at >= v_hoy
  ) >= 30 THEN
    RETURN jsonb_build_object('estado', 'lleno');
  END IF;

  INSERT INTO public.invitaciones (ingeniero_id, negocio, origen, cliente_id, abierta_en, ultima_visita, canal)
  VALUES (v_ingeniero, 'Sin nombre todavía', 'ingeniero', v_usuario, now(), now(), 'perfil');

  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.empezar_con_ingeniero(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empezar_con_ingeniero(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Invitaciones desde la página: sin nombre de negocio hasta que lo escribe
-- ----------------------------------------------------------------------------
-- Las mismas de supabase_invitaciones.sql, tratando canal 'perfil' como la
-- portada en lo del nombre, y con el nombre de su ingeniero.
CREATE OR REPLACE FUNCTION public.mi_invitacion()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', CASE WHEN (i.origen = 'portada' OR i.canal = 'perfil') AND i.empezada_en IS NULL THEN NULL ELSE i.negocio END,
    'activa', i.activa,
    'origen', i.origen,
    'ingeniero', (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = i.ingeniero_id)
  )
  FROM public.invitaciones i
  WHERE i.cliente_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.registrar_inicio_invitacion(p_negocio TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.invitaciones
  SET empezada_en = COALESCE(empezada_en, now()),
      negocio = CASE
        WHEN (origen = 'portada' OR canal = 'perfil') AND char_length(btrim(COALESCE(p_negocio, ''))) BETWEEN 1 AND 80
          THEN btrim(p_negocio)
        ELSE negocio
      END
  WHERE cliente_id = auth.uid() AND activa;
$$;

-- La vista del panel, con el canal al final (para «Desde tu página»).
CREATE OR REPLACE VIEW public.invitaciones_resumen
WITH (security_invoker = true) AS
SELECT
  i.id, i.token, i.negocio, i.es_prueba, i.activa, i.created_at, i.abierta_en, i.empezada_en, i.ultima_visita, i.centimos_ia,
  (SELECT min(p.created_at) FROM public.proyectos p WHERE p.user_id = i.cliente_id) AS maqueta_en,
  (SELECT min((p.payload->>'aceptado_en')::timestamptz)
     FROM public.proyectos p
     WHERE p.user_id = i.cliente_id AND p.payload->>'aceptado' = 'true') AS aceptada_en,
  i.origen,
  i.con_premium,
  i.canal
FROM public.invitaciones i;

GRANT SELECT ON public.invitaciones_resumen TO authenticated;
REVOKE ALL ON public.invitaciones_resumen FROM anon;

-- ----------------------------------------------------------------------------
-- 5. El slug en la lista pública de ingenieros (portada y elección)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingenieros_disponibles()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(x.fila ORDER BY x.promedio DESC NULLS LAST, x.resenas DESC, x.creado_en), '[]'::jsonb)
  FROM (
    SELECT
      pi.creado_en,
      (SELECT avg(r.estrellas) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
      (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas,
      jsonb_build_object(
        'id', pi.user_id,
        'slug', pi.slug,
        'nombre', pi.nombre,
        'titular', pi.titular,
        'bio', pi.bio,
        'especialidades', to_jsonb(pi.especialidades),
        'servicios', to_jsonb(pi.servicios),
        'servicios_otros', to_jsonb(pi.servicios_otros),
        'anios_experiencia', pi.anios_experiencia,
        'ciudad', pi.ciudad,
        'portafolio_url', pi.portafolio_url,
        'foto_url', pi.foto_url,
        'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
        'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
        'ultimas', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'estrellas', r.estrellas,
            'comentario', r.comentario,
            'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
            'negocio', p.payload->'ficha'->>'empresa',
            'fecha', r.creada_en
          ) ORDER BY r.creada_en DESC), '[]'::jsonb)
          FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 3) r
          JOIN public.proyectos p ON p.id = r.proyecto_id
        )
      ) AS fila
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ) x;
$$;
REVOKE ALL ON FUNCTION public.ingenieros_disponibles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingenieros_disponibles() TO anon, authenticated;
