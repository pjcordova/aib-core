-- ============================================================================
-- AIB+ — Portada tipo marketplace
-- ============================================================================
-- La portada deja de ser «la web de tu negocio» con los diseños del
-- administrador: enseña todos los servicios (web, CRM, ERP, automatización,
-- app) con los diseños, precios y reseñas de los ingenieros, como un
-- marketplace.
--
--   1. vitrina_portada(): lo que se ve sin cuenta. Por cada servicio, cuántos
--      ingenieros aprobados lo ofrecen y desde cuánto; y los diseños
--      publicados de los ingenieros aprobados (unos pocos por servicio).
--   2. Los diseños de la biblioteca de AIB+ (tipo 'biblioteca') son de un
--      ingeniero más. Si el ingeniero de una invitación aún no tiene diseños
--      de un servicio, su cliente ve los de la biblioteca, sean de quien sean
--      (antes: solo los del administrador).
--
-- El traspaso de la biblioteca del administrador a la cuenta de ingeniero del
-- dueño de AIB+ se hizo una vez, a mano (UPDATE plantillas SET ingeniero_id).
--
-- Ejecutar después de supabase_formularios_servicio.sql. Se puede ejecutar
-- más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Qué diseños ve cada cliente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plantillas_visibles()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
  v_premium   BOOLEAN := false;
BEGIN
  SELECT i.ingeniero_id, i.con_premium INTO v_ingeniero, v_premium
  FROM public.invitaciones i
  WHERE i.cliente_id = auth.uid() AND i.origen = 'ingeniero'
  LIMIT 1;

  IF v_ingeniero IS NOT NULL THEN
    -- Los suyos…
    RETURN QUERY
      SELECT p.id FROM public.plantillas p
      WHERE p.activa AND p.ingeniero_id = v_ingeniero AND (p.nivel <> 'premium' OR v_premium);
    -- …y, en los servicios donde aún no tiene, la biblioteca de AIB+ (una
    -- vez cada diseño, aunque lo tengan varios ingenieros).
    RETURN QUERY
      SELECT x.id FROM (
        SELECT DISTINCT ON (p.base) p.id
        FROM public.plantillas p
        WHERE p.activa
          AND p.tipo = 'biblioteca'
          AND p.nivel <> 'premium'
          AND p.ingeniero_id <> v_ingeniero
          AND NOT EXISTS (
            SELECT 1 FROM public.plantillas q
            WHERE q.ingeniero_id = v_ingeniero AND q.activa AND q.servicio = p.servicio
          )
        ORDER BY p.base, p.created_at
      ) x;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id FROM public.plantillas p
    WHERE p.activa
      AND p.nivel <> 'premium'
      AND (
        public.es_admin_id(p.ingeniero_id)
        OR EXISTS (
          SELECT 1 FROM public.perfiles_ingeniero pi
          WHERE pi.user_id = p.ingeniero_id AND pi.estado = 'aprobado' AND public.es_ingeniero_id(pi.user_id)
        )
      );
END;
$$;

REVOKE ALL ON FUNCTION public.plantillas_visibles() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La vitrina de la portada
-- ----------------------------------------------------------------------------
-- Sin cuenta: nada privado (ni WhatsApp ni correo de los ingenieros, ni
-- contadores). Hasta 6 diseños por servicio: primero los que más se aceptan.
CREATE OR REPLACE FUNCTION public.vitrina_portada()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ingenieros AS (
    SELECT pi.user_id, pi.nombre, pi.foto_url, pi.slug, public.servicios_cliente(pi.servicios) AS servicios,
           (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
           (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ),
  disenos AS (
    SELECT p.*, i.nombre AS ing_nombre, i.foto_url AS ing_foto, i.slug AS ing_slug,
           i.promedio AS ing_promedio, i.resenas AS ing_resenas,
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
          'promedio', d.ing_promedio, 'resenas', d.ing_resenas
        )
      ) ORDER BY d.servicio, d.puesto), '[]'::jsonb)
      FROM disenos d
      WHERE d.puesto <= 6
    )
  );
$$;

REVOKE ALL ON FUNCTION public.vitrina_portada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vitrina_portada() TO anon, authenticated;
