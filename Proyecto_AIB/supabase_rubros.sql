-- ============================================================================
-- AIB+ — Diseños para las páginas por rubro (/rubros/:slug)
-- ============================================================================
-- vitrina_portada devuelve solo 6 diseños por servicio (los más elegidos), así
-- que un diseño nuevo de un rubro (un gimnasio, un consultorio) puede no
-- estar entre ellos. Esta función busca, entre todos los diseños web
-- publicados, los que tienen las palabras del rubro en su nombre, descripción,
-- base o etiquetas (sin tildes), ordenados por cuántas coinciden. Si ninguno
-- coincide, devuelve los de su categoría. Hasta 6, con el mismo formato que
-- las plantillas de vitrina_portada. Pública, como la vitrina.
--
-- Las palabras salen de src/data/paginasRubro.json. Ejecutar después de
-- supabase_verificados.sql. Se puede ejecutar más de una vez.
-- ============================================================================

-- La versión vigente (Pro y Negocio primero) está en supabase_destacados.sql:
-- si se vuelve a ejecutar este archivo, ejecutar ese después.
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
           (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
           (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ),
  candidatos AS (
    SELECT p.*, i.nombre AS ing_nombre, i.foto_url AS ing_foto, i.slug AS ing_slug,
           i.promedio AS ing_promedio, i.resenas AS ing_resenas, i.verificado AS ing_verificado,
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
  ) ORDER BY e.puntos DESC, e.veces_aceptada DESC, e.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM elegidos ORDER BY puntos DESC, veces_aceptada DESC, created_at DESC LIMIT 6
  ) e;
$$;

REVOKE ALL ON FUNCTION public.disenos_de_rubro(TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disenos_de_rubro(TEXT[], TEXT) TO anon, authenticated;
