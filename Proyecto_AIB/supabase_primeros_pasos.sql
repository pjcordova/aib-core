-- ============================================================================
-- AIB+ — Primeros pasos del ingeniero
-- ============================================================================
-- Lo que le falta a un ingeniero aprobado para empezar a recibir clientes, en
-- cinco pasos. Lo ve en «Hoy» y el administrador ve el avance de cada uno en
-- «Ingenieros», para ayudarle.
--
--   perfil      foto y una presentación de al menos 60 caracteres
--   diseno      al menos un diseño publicado
--   precio      todos sus diseños publicados con precio
--   avisos      WhatsApp de avisos activado (CallMeBot)
--   invitacion  al menos una invitación real a un cliente
--
-- Ejecutar después de supabase_recordatorios.sql. Se puede ejecutar más de
-- una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.primeros_pasos(p_usuario UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('clave', 'perfil', 'hecho',
      pi.foto_url IS NOT NULL AND char_length(btrim(COALESCE(pi.bio, ''))) >= 60),
    jsonb_build_object('clave', 'diseno', 'hecho',
      EXISTS (SELECT 1 FROM public.plantillas p WHERE p.ingeniero_id = p_usuario AND p.activa)),
    jsonb_build_object('clave', 'precio', 'hecho',
      EXISTS (SELECT 1 FROM public.plantillas p WHERE p.ingeniero_id = p_usuario AND p.activa)
      AND NOT EXISTS (
        SELECT 1 FROM public.plantillas p WHERE p.ingeniero_id = p_usuario AND p.activa AND p.precio_desde IS NULL
      )),
    jsonb_build_object('clave', 'avisos', 'hecho',
      EXISTS (SELECT 1 FROM public.avisos_ingeniero a WHERE a.user_id = p_usuario AND a.callmebot_apikey IS NOT NULL)),
    jsonb_build_object('clave', 'invitacion', 'hecho',
      EXISTS (
        SELECT 1 FROM public.invitaciones i
        WHERE i.ingeniero_id = p_usuario AND i.origen = 'ingeniero' AND NOT i.es_prueba
      ))
  )
  FROM public.perfiles_ingeniero pi
  WHERE pi.user_id = p_usuario;
$$;

REVOKE ALL ON FUNCTION public.primeros_pasos(UUID) FROM PUBLIC, anon, authenticated;

-- Los suyos. null para quien no tiene perfil de ingeniero o es miembro del
-- equipo de otro (no recibe clientes a su nombre).
CREATE OR REPLACE FUNCTION public.mis_primeros_pasos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT public.es_ingeniero() THEN NULL
    WHEN public.dueno_de_mi_equipo() IS NOT NULL AND public.dueno_de_mi_equipo() <> auth.uid() THEN NULL
    ELSE (
      SELECT jsonb_build_object('slug', pi.slug, 'estado', pi.estado, 'pasos', public.primeros_pasos(pi.user_id))
      FROM public.perfiles_ingeniero pi
      WHERE pi.user_id = auth.uid()
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.mis_primeros_pasos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_primeros_pasos() TO authenticated;

-- Los de todos los ingenieros aprobados o en pausa, para el administrador.
CREATE OR REPLACE FUNCTION public.primeros_pasos_ingenieros()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NOT public.es_admin_id(auth.uid()) THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pi.user_id, 'pasos', public.primeros_pasos(pi.user_id)))
      FROM public.perfiles_ingeniero pi
      WHERE pi.estado IN ('aprobado', 'pausado')
    ), '[]'::jsonb)
  END;
$$;

REVOKE ALL ON FUNCTION public.primeros_pasos_ingenieros() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.primeros_pasos_ingenieros() TO authenticated;
