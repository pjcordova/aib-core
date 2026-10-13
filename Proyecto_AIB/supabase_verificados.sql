-- ============================================================================
-- AIB+ — Insignia «Verificado» para ingenieros
-- ============================================================================
-- El administrador comprueba la identidad del ingeniero (DNI en una
-- videollamada) y revisa al menos un trabajo real suyo; entonces lo marca como
-- verificado. La insignia sale en su tarjeta, en su página, en los diseños y
-- en el buscador, y los verificados aparecen primero.
--
-- El ingeniero puede pedirla desde su perfil (pedir_verificacion): queda
-- anotado para el administrador, que además recibe un WhatsApp del servidor.
-- Nadie se la puede poner a sí mismo: la tabla no tiene permisos de escritura
-- y solo verificar_ingeniero, del administrador, la cambia.
--
-- Redefine ingenieros_disponibles (supabase_plantillas_propias.sql),
-- ingenieros_para_admin (supabase_marketplace.sql), vitrina_portada
-- (supabase_portada_marketplace.sql) y perfil_publico (supabase_portafolio.sql)
-- con la insignia: este archivo va después de ellos y es la versión vigente.
-- Se puede ejecutar más de una vez.
-- ============================================================================

ALTER TABLE public.perfiles_ingeniero
  ADD COLUMN IF NOT EXISTS verificado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verificacion_pedida_en TIMESTAMPTZ;


-- ----------------------------------------------------------------------------
-- 1. El administrador verifica (o quita la verificación)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_ingeniero(p_usuario UUID, p_verificar BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador verifica ingenieros' USING ERRCODE = '42501';
  END IF;

  UPDATE public.perfiles_ingeniero
  SET verificado_en = CASE WHEN p_verificar THEN COALESCE(verificado_en, now()) END,
      verificacion_pedida_en = NULL
  WHERE user_id = p_usuario AND estado IN ('aprobado', 'pausado');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_ingeniero(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_ingeniero(UUID, BOOLEAN) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. El ingeniero la pide
-- ----------------------------------------------------------------------------
-- 'ok', 'ya_verificado', 'ya_pedida' (en la última semana) o 'no_ingeniero'.
CREATE OR REPLACE FUNCTION public.pedir_verificacion()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil public.perfiles_ingeniero%ROWTYPE;
BEGIN
  SELECT * INTO v_perfil FROM public.perfiles_ingeniero
  WHERE user_id = auth.uid() AND estado = 'aprobado'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_ingeniero';
  END IF;
  IF v_perfil.verificado_en IS NOT NULL THEN
    RETURN 'ya_verificado';
  END IF;
  IF v_perfil.verificacion_pedida_en > now() - interval '7 days' THEN
    RETURN 'ya_pedida';
  END IF;

  UPDATE public.perfiles_ingeniero SET verificacion_pedida_en = now() WHERE user_id = auth.uid();
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.pedir_verificacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_verificacion() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Las funciones públicas, con la insignia
-- ----------------------------------------------------------------------------

-- Los verificados, primero.
-- La versión vigente (Pro y Negocio primero) está en supabase_destacados.sql:
-- si se vuelve a ejecutar este archivo, ejecutar ese después.
CREATE OR REPLACE FUNCTION public.ingenieros_disponibles()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(x.fila ORDER BY x.verificado DESC, x.promedio DESC NULLS LAST, x.resenas DESC, x.creado_en), '[]'::jsonb)
  FROM (
    SELECT
      pi.creado_en,
      pi.verificado_en IS NOT NULL AS verificado,
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
        'verificado', pi.verificado_en IS NOT NULL,
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

-- Las solicitudes pendientes primero, luego quienes pidieron la insignia.
CREATE OR REPLACE FUNCTION public.ingenieros_para_admin()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador revisa ingenieros' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', pi.user_id,
      'correo', u.email,
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
      'whatsapp', pi.whatsapp,
      'estado', pi.estado,
      'es_admin', COALESCE(pf.es_admin, false),
      'creado_en', pi.creado_en,
      'verificado_en', pi.verificado_en,
      'verificacion_pedida_en', pi.verificacion_pedida_en,
      'encargos', (SELECT count(*) FROM public.proyectos p WHERE p.ingeniero_id = pi.user_id AND p.payload->>'aceptado' = 'true'),
      'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
      'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id)
    ) ORDER BY (pi.estado = 'pendiente') DESC, (pi.verificacion_pedida_en IS NOT NULL) DESC, pi.creado_en), '[]'::jsonb)
    FROM public.perfiles_ingeniero pi
    JOIN auth.users u ON u.id = pi.user_id
    LEFT JOIN public.perfiles pf ON pf.user_id = pi.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingenieros_para_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingenieros_para_admin() TO authenticated;

-- La versión vigente (Pro y Negocio primero) está en supabase_destacados.sql:
-- si se vuelve a ejecutar este archivo, ejecutar ese después.
CREATE OR REPLACE FUNCTION public.vitrina_portada()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ingenieros AS (
    SELECT pi.user_id, pi.nombre, pi.foto_url, pi.slug, public.servicios_cliente(pi.servicios) AS servicios,
           pi.verificado_en IS NOT NULL AS verificado,
           (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
           (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ),
  disenos AS (
    SELECT p.*, i.nombre AS ing_nombre, i.foto_url AS ing_foto, i.slug AS ing_slug,
           i.promedio AS ing_promedio, i.resenas AS ing_resenas, i.verificado AS ing_verificado,
           row_number() OVER (
             PARTITION BY p.servicio
             ORDER BY p.veces_aceptada DESC, i.promedio DESC NULLS LAST, p.created_at DESC
           ) AS puesto
    FROM public.plantillas p
    JOIN ingenieros i ON i.user_id = p.ingeniero_id
    WHERE p.activa AND p.nivel <> 'premium' AND p.servicio NOT LIKE 'otro:%'
  )
  SELECT jsonb_build_object(
    'servicios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'clave', v.clave,
        'ingenieros', (SELECT count(*) FROM ingenieros i WHERE v.clave = ANY (i.servicios)),
        'plantillas', (SELECT count(*) FROM disenos d WHERE d.servicio = v.clave),
        'desde', (SELECT min(d.precio_desde) FROM disenos d WHERE d.servicio = v.clave)
      ) ORDER BY v.orden), '[]'::jsonb)
      FROM (VALUES ('web', 1), ('crm', 2), ('erp', 3), ('automatizacion', 4), ('app-movil', 5)) AS v(clave, orden)
    ),
    'plantillas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'tipo', d.tipo, 'servicio', d.servicio, 'base', d.base, 'nombre', d.nombre,
        'descripcion', d.descripcion, 'categoria', d.categoria, 'estilo', d.estilo,
        'etiquetas', to_jsonb(d.etiquetas), 'nivel', d.nivel, 'precio_desde', d.precio_desde,
        'color_primario', d.color_primario, 'color_secundario', d.color_secundario,
        'html', d.html, 'css', d.css, 'fuentes', to_jsonb(d.fuentes),
        'ingeniero', jsonb_build_object(
          'nombre', d.ing_nombre, 'foto_url', d.ing_foto, 'slug', d.ing_slug,
          'promedio', d.ing_promedio, 'resenas', d.ing_resenas, 'verificado', d.ing_verificado
        )
      ) ORDER BY d.servicio, d.puesto), '[]'::jsonb)
      FROM disenos d
      WHERE d.puesto <= 6
    )
  );
$$;

REVOKE ALL ON FUNCTION public.vitrina_portada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vitrina_portada() TO anon, authenticated;

-- La versión vigente está en supabase_plan_pro.sql: si se vuelve a ejecutar
-- este archivo, ejecutar ese después.
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
    'verificado', pi.verificado_en IS NOT NULL,
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
        'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
        'negocio', p.payload->'ficha'->>'empresa',
        'fecha', r.creada_en
      ) ORDER BY r.creada_en DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 10) r
      JOIN public.proyectos p ON p.id = r.proyecto_id
    ),
    'disenos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tipo', t.tipo, 'servicio', t.servicio, 'base', t.base, 'nombre', t.nombre,
        'descripcion', t.descripcion, 'categoria', t.categoria, 'estilo', t.estilo,
        'etiquetas', to_jsonb(t.etiquetas), 'nivel', t.nivel, 'precio_desde', t.precio_desde,
        'color_primario', t.color_primario, 'color_secundario', t.color_secundario,
        'html', t.html, 'css', t.css, 'fuentes', to_jsonb(t.fuentes)
      ) ORDER BY t.nivel, t.precio_desde NULLS LAST, t.created_at), '[]'::jsonb)
      FROM (
        SELECT * FROM public.plantillas
        WHERE ingeniero_id = pi.user_id AND activa AND nivel <> 'premium'
        ORDER BY created_at
        LIMIT 12
      ) t
    ),
    'trabajos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', w.id, 'titulo', w.titulo, 'servicio', w.servicio, 'enlace', w.enlace,
        'descripcion', w.descripcion, 'imagen_url', w.imagen_url
      ) ORDER BY w.orden, w.creado_en), '[]'::jsonb)
      FROM public.portafolio_ingeniero w
      WHERE w.ingeniero_id = pi.user_id
    )
  )
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.perfil_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perfil_publico(TEXT) TO anon, authenticated;
