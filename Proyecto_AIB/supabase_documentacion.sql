-- ============================================================================
-- AIB+ — Regenerar la documentación de un encargo
-- ============================================================================
-- adjuntar_documentacion (supabase_marketplace.sql) solo rellena la de un
-- encargo que aún no la tiene. Desde el 2026-10-12 la documentación trae más
-- (la primera llamada, los materiales, el plan por etapas y, en las webs, el
-- mapa del sitio y la publicación): el ingeniero puede regenerar la de un
-- encargo suyo con el formato nuevo. Mismos permisos que adjuntarla, más su
-- equipo, y un tope de tamaño.
--
-- Ejecutar después de supabase_marketplace.sql y supabase_equipos.sql.
-- Se puede ejecutar más de una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reemplazar_documentacion(p_proyecto UUID, p_documentacion JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  filas INTEGER;
BEGIN
  IF NOT public.es_ingeniero()
     OR jsonb_typeof(p_documentacion) IS DISTINCT FROM 'object'
     OR octet_length(p_documentacion::text) > 100000 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.proyectos
  SET payload = jsonb_set(payload, '{documentacion}', p_documentacion)
  WHERE id = p_proyecto
    AND payload->>'aceptado' = 'true'
    AND (
      ingeniero_id = auth.uid()
      OR ingeniero_id = public.dueno_de_mi_equipo()
      OR public.es_admin()
    );

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.reemplazar_documentacion(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_documentacion(UUID, JSONB) TO authenticated;
