-- ============================================================================
-- AIB+ — Enlaces para compartir la maqueta
-- ============================================================================
-- El cliente puede mandar su maqueta web a otra persona (su socio, su
-- familia) con un enlace. Quien lo abre no necesita cuenta y solo ve la
-- maqueta: ni el contacto, ni el presupuesto, ni las respuestas.
--
--   - enlaces_compartidos: un código aleatorio por proyecto. El dueño lo ve y
--     lo borra (deja de compartir); no puede escribirlo a mano.
--   - compartir_proyecto(): crea el enlace de un proyecto web propio, o
--     devuelve el que ya tenía.
--   - maqueta_compartida(): lo único que se puede leer sin sesión. Con el
--     código devuelve solo lo necesario para pintar la maqueta.
--
-- Ejecutar después de supabase_rls_setup.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.enlaces_compartidos (
  -- 32 caracteres hexadecimales de un UUID v4: 122 bits aleatorios, imposible
  -- de adivinar recorriendo códigos.
  token       TEXT PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  proyecto_id UUID NOT NULL UNIQUE REFERENCES public.proyectos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.enlaces_compartidos ENABLE ROW LEVEL SECURITY;

-- Sin políticas de INSERT ni UPDATE: los enlaces solo los crea
-- compartir_proyecto(), que es quien genera el código.
DROP POLICY IF EXISTS "enlaces: el dueño los ve" ON public.enlaces_compartidos;
CREATE POLICY "enlaces: el dueño los ve"
  ON public.enlaces_compartidos FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "enlaces: el dueño los borra" ON public.enlaces_compartidos;
CREATE POLICY "enlaces: el dueño los borra"
  ON public.enlaces_compartidos FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- Crear (o recuperar) el enlace de un proyecto web propio
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compartir_proyecto(p_proyecto UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_token   TEXT;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Hace falta iniciar sesión' USING ERRCODE = '42501';
  END IF;

  -- Solo proyectos propios y solo maquetas web: un prototipo de ERP no se
  -- comparte por aquí.
  IF NOT EXISTS (
    SELECT 1 FROM public.proyectos
    WHERE id = p_proyecto
      AND user_id = v_usuario
      AND payload->>'tipo_servicio' = 'web'
      AND (payload ? 'documento' OR payload ? 'html')
  ) THEN
    RAISE EXCEPTION 'Proyecto no encontrado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.enlaces_compartidos (proyecto_id, user_id)
  VALUES (p_proyecto, v_usuario)
  ON CONFLICT (proyecto_id) DO NOTHING;

  SELECT token INTO v_token FROM public.enlaces_compartidos WHERE proyecto_id = p_proyecto;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.compartir_proyecto(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compartir_proyecto(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- Leer una maqueta compartida, sin sesión
-- ----------------------------------------------------------------------------
-- Devuelve solo lo que hace falta para pintarla: la página (o el cuerpo que
-- escribió la IA) y el nombre, el logo y los colores con que se monta. Nada
-- del resto del proyecto. Si el código no existe, devuelve NULL.
CREATE OR REPLACE FUNCTION public.maqueta_compartida(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'empresa',   p.payload->'ficha'->>'empresa',
    'logo',      p.payload->'ficha'->>'logo',
    'paleta',    p.payload->'ficha'->'paleta',
    'documento', p.payload->>'documento',
    'html',      p.payload->>'html'
  )
  FROM public.enlaces_compartidos e
  JOIN public.proyectos p ON p.id = e.proyecto_id
  WHERE p_token ~ '^[0-9a-f]{32}$'
    AND e.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.maqueta_compartida(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maqueta_compartida(TEXT) TO anon, authenticated;
