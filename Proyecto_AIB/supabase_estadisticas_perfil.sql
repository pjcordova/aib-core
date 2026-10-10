-- ============================================================================
-- AIB+ — Estadísticas de la página pública del ingeniero
-- ============================================================================
-- Cuántas personas abren /ing/:slug y qué pasa después, para que el ingeniero
-- sepa si compartir su página le trae clientes. Solo cifras por día: ni
-- quién entró ni desde dónde.
--
--   - Visitas: cada navegador cuenta una vez por sesión (lo controla la
--     página); las del propio ingeniero no cuentan.
--   - Empezaron (pulsaron «Trabajar con…» o «Lo quiero»), vieron su proyecto
--     y te eligieron: las invitaciones que nacen de su página, del buscador o
--     de sus diseños en la portada (canal 'perfil').
--
-- Ejecutar después de supabase_perfil_publico.sql. Se puede ejecutar más de
-- una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.visitas_perfil (
  ingeniero_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  dia          DATE NOT NULL,
  visitas      INTEGER NOT NULL DEFAULT 0 CHECK (visitas >= 0),
  PRIMARY KEY (ingeniero_id, dia)
);

-- Solo se escriben y leen con las funciones de abajo.
ALTER TABLE public.visitas_perfil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitas_perfil FROM anon, authenticated;

-- Una visita a la página de un ingeniero aprobado. Con tope diario, para que
-- nadie infle las cifras a golpe de recarga.
CREATE OR REPLACE FUNCTION public.registrar_visita_perfil(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
BEGIN
  SELECT pi.user_id INTO v_ingeniero
  FROM public.perfiles_ingeniero pi
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';

  IF v_ingeniero IS NULL OR v_ingeniero = auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.visitas_perfil AS v (ingeniero_id, dia, visitas)
  VALUES (v_ingeniero, public.hoy_lima(), 1)
  ON CONFLICT (ingeniero_id, dia) DO UPDATE
    SET visitas = v.visitas + 1
    WHERE v.visitas < 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_visita_perfil(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_visita_perfil(TEXT) TO anon, authenticated;

-- Las del ingeniero, de los últimos 30 días.
CREATE OR REPLACE FUNCTION public.estadisticas_mi_pagina()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.es_ingeniero() THEN NULL ELSE jsonb_build_object(
    'visitas_30', (
      SELECT COALESCE(sum(v.visitas), 0) FROM public.visitas_perfil v
      WHERE v.ingeniero_id = auth.uid() AND v.dia > public.hoy_lima() - 30
    ),
    'visitas_7', (
      SELECT COALESCE(sum(v.visitas), 0) FROM public.visitas_perfil v
      WHERE v.ingeniero_id = auth.uid() AND v.dia > public.hoy_lima() - 7
    ),
    'empezaron', (
      SELECT count(*) FROM public.invitaciones i
      WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
    ),
    'vieron', (
      SELECT count(*) FROM public.invitaciones i
      WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.user_id = i.cliente_id)
    ),
    'eligieron', (
      SELECT count(*) FROM public.invitaciones i
      WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.user_id = i.cliente_id AND p.payload->>'aceptado' = 'true')
    )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.estadisticas_mi_pagina() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estadisticas_mi_pagina() TO authenticated;
