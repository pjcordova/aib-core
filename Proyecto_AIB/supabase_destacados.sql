-- ============================================================================
-- AIB+ — Los ingenieros con plan Pro o Negocio aparecen primero
-- ============================================================================
-- Beneficio del plan desde el 2026-10-12: en la lista de ingenieros (portada,
-- buscador, páginas por servicio y por rubro, y la ventana donde el cliente
-- elige ingeniero) y en los diseños de la portada y de cada rubro, primero
-- van los de quienes tienen Pro o Negocio (también el administrador y los
-- miembros de un equipo activo: plan_de en supabase_planes.sql). Dentro de
-- cada grupo, el orden de siempre: verificados, estrellas, reseñas…
--
-- ingenieros_disponibles devuelve además `destacado`, para que el buscador
-- (que ordena en el navegador) haga lo mismo.
--
-- Reemplaza ingenieros_disponibles y vitrina_portada de
-- supabase_verificados.sql y disenos_de_rubro de supabase_rubros.sql: si se
-- vuelve a ejecutar alguno de esos, ejecutar este después. Se puede ejecutar
-- más de una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ingenieros_disponibles()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(x.fila ORDER BY x.destacado DESC, x.verificado DESC, x.promedio DESC NULLS LAST, x.resenas DESC, x.creado_en), '[]'::jsonb)
  FROM (
    SELECT
      pi.creado_en,
      public.plan_de(pi.user_id) <> 'free' AS destacado,
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
        'destacado', public.plan_de(pi.user_id) <> 'free',
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
           public.plan_de(pi.user_id) <> 'free' AS destacado,
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
             ORDER BY i.destacado DESC, p.veces_aceptada DESC, i.promedio DESC NULLS LAST, p.created_at DESC
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

-- Solo diseños de este negocio (o de su categoría): entre ellos, primero los
-- de Pro y Negocio y luego los que más coinciden.
CREATE OR REPLACE FUNCTION public.disenos_de_rubro(p_palabras TEXT[], p_categoria TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH palabras AS (
    -- Raíces cortas, en minúsculas y sin tildes, como en el JSON.
    SELECT DISTINCT w
    FROM unnest(COALESCE(p_palabras, '{}'::TEXT[])) AS w
    WHERE char_length(w) BETWEEN 2 AND 30 AND w ~ '^[a-z0-9 -]+$'
    LIMIT 15
  ),
  ingenieros AS (
    SELECT pi.user_id, pi.nombre, pi.foto_url, pi.slug,
           pi.verificado_en IS NOT NULL AS verificado,
           public.plan_de(pi.user_id) <> 'free' AS destacado,
           (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
           (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ),
  candidatos AS (
    SELECT p.*, i.nombre AS ing_nombre, i.foto_url AS ing_foto, i.slug AS ing_slug,
           i.promedio AS ing_promedio, i.resenas AS ing_resenas, i.verificado AS ing_verificado,
           i.destacado AS ing_destacado,
           (
             SELECT count(*) FROM palabras pa
             WHERE translate(
                     lower(concat_ws(' ', p.nombre, p.descripcion, p.base, array_to_string(p.etiquetas, ' '))),
                     'áéíóúüñ', 'aeiouun'
                   ) LIKE '%' || pa.w || '%'
           ) AS puntos
    FROM public.plantillas p
    JOIN ingenieros i ON i.user_id = p.ingeniero_id
    WHERE p.activa AND p.nivel <> 'premium' AND p.servicio = 'web'
  ),
  elegidos AS (
    SELECT * FROM candidatos WHERE puntos > 0
    UNION ALL
    -- Ninguno es de este negocio: los de su categoría (un gimnasio comparte «salud» con un spa).
    SELECT * FROM candidatos
    WHERE puntos = 0 AND categoria = p_categoria
      AND NOT EXISTS (SELECT 1 FROM candidatos c WHERE c.puntos > 0)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'tipo', e.tipo, 'servicio', e.servicio, 'base', e.base, 'nombre', e.nombre,
    'descripcion', e.descripcion, 'categoria', e.categoria, 'estilo', e.estilo,
    'etiquetas', to_jsonb(e.etiquetas), 'nivel', e.nivel, 'precio_desde', e.precio_desde,
    'color_primario', e.color_primario, 'color_secundario', e.color_secundario,
    'html', e.html, 'css', e.css, 'fuentes', to_jsonb(e.fuentes),
    'ingeniero', jsonb_build_object(
      'nombre', e.ing_nombre, 'foto_url', e.ing_foto, 'slug', e.ing_slug,
      'promedio', e.ing_promedio, 'resenas', e.ing_resenas, 'verificado', e.ing_verificado
    )
  ) ORDER BY e.ing_destacado DESC, e.puntos DESC, e.veces_aceptada DESC, e.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM elegidos ORDER BY ing_destacado DESC, puntos DESC, veces_aceptada DESC, created_at DESC LIMIT 6
  ) e;
$$;
