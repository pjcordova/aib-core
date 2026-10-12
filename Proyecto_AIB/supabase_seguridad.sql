-- ============================================================================
-- AIB+ — Ajustes de seguridad (revisión del 2026-10-11)
-- ============================================================================
-- Estas funciones buscaban tablas en el esquema «public» por su cuenta
-- (search_path = public). Ya escriben todo con su nombre completo
-- (public.tabla, auth.uid()), así que se les quita esa búsqueda, como al
-- resto: nadie puede colarles un objeto con el mismo nombre.
--
-- En la misma revisión, guardar_perfil_ingeniero (supabase_marketplace.sql)
-- dejó de aprobar solo el perfil de un miembro de equipo: ahora pasa por la
-- revisión del administrador como cualquier postulación.
--
-- Ejecutar después de todos los demás archivos. Si se vuelve a ejecutar
-- supabase_cuota_ia.sql, supabase_invitaciones.sql, supabase_marketplace.sql
-- o supabase_roles_plantillas.sql, ejecutar este otra vez al final.
-- Se puede ejecutar más de una vez.
-- ============================================================================

ALTER FUNCTION public.reservar_cuota_ia(TEXT) SET search_path = '';
ALTER FUNCTION public.devolver_cuota_ia(TEXT) SET search_path = '';
ALTER FUNCTION public.adjuntar_documentacion(UUID, JSONB) SET search_path = '';
ALTER FUNCTION public.registrar_evento_plantilla(UUID, TEXT) SET search_path = '';
ALTER FUNCTION public.es_admin() SET search_path = '';
ALTER FUNCTION public.es_ingeniero() SET search_path = '';
-- La que crea el perfil al registrarse (disparador en auth.users).
ALTER FUNCTION public.crear_perfil() SET search_path = '';
