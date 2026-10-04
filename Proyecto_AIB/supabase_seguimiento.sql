-- ============================================================================
-- AIB+ — Seguimiento de encargos
-- ============================================================================
-- Después de aceptar, el cliente sabe en qué etapa está su encargo:
--
--   Recibido → En revisión → Propuesta enviada → En desarrollo → Publicada
--
-- "Recibido" no se guarda: es el momento en que el cliente aceptó. Cada
-- cambio posterior lo hace el ingeniero y queda como una fila nueva, con una
-- nota opcional para el cliente. Las filas no se editan ni se borran: son el
-- historial que ve el cliente.
--
-- Va en una tabla propia y no en el payload del proyecto porque el payload lo
-- puede escribir su dueño: así el cliente no puede cambiar su propio estado.
--
-- Ejecutar después de supabase_roles_plantillas.sql (usa es_ingeniero). Se
-- puede ejecutar más de una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seguimiento_encargos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  estado      TEXT NOT NULL CHECK (estado IN ('recibido', 'en_revision', 'propuesta_enviada', 'en_desarrollo', 'publicada')),
  nota        TEXT CHECK (nota IS NULL OR char_length(nota) BETWEEN 1 AND 280),
  autor_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seguimiento_encargos_proyecto_idx
  ON public.seguimiento_encargos (proyecto_id, created_at);

ALTER TABLE public.seguimiento_encargos ENABLE ROW LEVEL SECURITY;

-- El cliente ve el seguimiento de sus proyectos; el ingeniero, el de todos.
DROP POLICY IF EXISTS "seguimiento: lo ven el dueño y el ingeniero" ON public.seguimiento_encargos;
CREATE POLICY "seguimiento: lo ven el dueño y el ingeniero"
  ON public.seguimiento_encargos FOR SELECT TO authenticated
  USING (
    public.es_ingeniero()
    OR EXISTS (
      SELECT 1 FROM public.proyectos p
      WHERE p.id = proyecto_id AND p.user_id = (SELECT auth.uid())
    )
  );

-- Solo el ingeniero avanza etapas, en su nombre y solo de encargos aceptados.
-- Sin políticas de UPDATE ni DELETE: el historial no se reescribe.
DROP POLICY IF EXISTS "seguimiento: el ingeniero añade etapas" ON public.seguimiento_encargos;
CREATE POLICY "seguimiento: el ingeniero añade etapas"
  ON public.seguimiento_encargos FOR INSERT TO authenticated
  WITH CHECK (
    public.es_ingeniero()
    AND autor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.proyectos p
      WHERE p.id = proyecto_id AND p.payload->>'aceptado' = 'true'
    )
  );
