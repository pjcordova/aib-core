-- ============================================================================
-- AIB+ — Buscador de ingenieros (/explorar)
-- ============================================================================
-- Lo que el buscador añade a ingenieros_disponibles(): cuántos diseños
-- publicados tiene cada ingeniero, desde cuánto (en total y por servicio) y
-- cuántos proyectos ya entregó. Sin cuenta y sin nada privado.
--
-- Ejecutar después de supabase_recordatorios.sql (usa etapa_actual). Se
-- puede ejecutar más de una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.precios_ingenieros()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pi.user_id,
    'creado_en', pi.creado_en,
    'disenos', (
      SELECT count(*) FROM public.plantillas p
      WHERE p.ingeniero_id = pi.user_id AND p.activa AND p.nivel <> 'premium'
    ),
    'desde', (
      SELECT min(p.precio_desde) FROM public.plantillas p
      WHERE p.ingeniero_id = pi.user_id AND p.activa AND p.nivel <> 'premium'
    ),
    'desde_por_servicio', (
      SELECT COALESCE(jsonb_object_agg(x.servicio, x.desde), '{}'::jsonb)
      FROM (
        SELECT p.servicio, min(p.precio_desde) AS desde
        FROM public.plantillas p
        WHERE p.ingeniero_id = pi.user_id AND p.activa AND p.nivel <> 'premium' AND p.precio_desde IS NOT NULL
        GROUP BY p.servicio
      ) x
    ),
    'entregados', (
      SELECT count(*) FROM public.proyectos pr
      WHERE pr.ingeniero_id = pi.user_id AND public.etapa_actual(pr.id) = 'publicada'
    )
  )), '[]'::jsonb)
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.precios_ingenieros() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precios_ingenieros() TO anon, authenticated;
