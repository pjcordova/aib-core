-- ============================================================================
-- AIB+ — Encargos aceptados: protección y aviso al ingeniero
-- ============================================================================
-- 1. Un encargo aceptado ya es trabajo del ingeniero: su dueño no puede
--    borrarlo, ni "desaceptarlo" para borrarlo después.
-- 2. Cuando un cliente acepta, el servidor avisa al ingeniero por correo. Esta
--    función le da los datos del encargo, y solo la primera vez: así nadie
--    puede provocar correos repetidos.
--
-- Sustituye la política de borrado de supabase_rls_setup.sql. Ejecutar
-- después de ese script. Se puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Encargos aceptados protegidos
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own projects" ON public.proyectos;
CREATE POLICY "Users can delete own projects"
  ON public.proyectos FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND (payload->>'aceptado') IS DISTINCT FROM 'true'
  );

-- La política de UPDATE deja al dueño escribir su payload entero: sin esto,
-- podría quitar la marca de aceptado y borrar el encargo a continuación.
CREATE OR REPLACE FUNCTION public.proteger_encargo_aceptado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.payload->>'aceptado' = 'true' AND (NEW.payload->>'aceptado') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Un encargo aceptado no se puede deshacer' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_encargo_aceptado ON public.proyectos;
CREATE TRIGGER proteger_encargo_aceptado
  BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_encargo_aceptado();

-- ----------------------------------------------------------------------------
-- 2. Aviso al ingeniero, una sola vez por encargo
-- ----------------------------------------------------------------------------
-- Sin políticas: solo se escribe desde registrar_aviso_encargo().
CREATE TABLE IF NOT EXISTS public.avisos_encargo (
  proyecto_id UUID PRIMARY KEY REFERENCES public.proyectos(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.avisos_encargo ENABLE ROW LEVEL SECURITY;

-- La llama el servidor con el token del cliente que acaba de aceptar. Devuelve
-- lo que va en el correo si el proyecto es suyo, está aceptado y aún no se
-- había avisado; en cualquier otro caso, NULL.
CREATE OR REPLACE FUNCTION public.registrar_aviso_encargo(p_proyecto UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  SELECT payload INTO v_payload
  FROM public.proyectos
  WHERE id = p_proyecto
    AND user_id = auth.uid()
    AND payload->>'aceptado' = 'true';

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.avisos_encargo (proyecto_id) VALUES (p_proyecto)
  ON CONFLICT (proyecto_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN NULL; -- ya se avisó
  END IF;

  RETURN jsonb_build_object(
    'servicio',      v_payload->>'servicio',
    'tipo_servicio', v_payload->>'tipo_servicio',
    'empresa',       v_payload->'ficha'->>'empresa',
    'plantilla',     v_payload->'plantilla'->>'nombre',
    'cliente',       v_payload->'contacto'->>'nombre',
    'whatsapp',      v_payload->'contacto'->>'whatsapp',
    'correo',        v_payload->'contacto'->>'correo',
    'presupuesto', (
      SELECT h->>'answer' FROM jsonb_array_elements(COALESCE(v_payload->'historial', '[]'::jsonb)) h
      WHERE h->>'question_id' = 'presupuesto' LIMIT 1
    ),
    'alcance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('pregunta', h->>'question', 'respuesta', h->>'answer')), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(v_payload->'historial', '[]'::jsonb)) h
      WHERE h->>'question_id' LIKE 'alcance-%'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_aviso_encargo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_aviso_encargo(UUID) TO authenticated;
