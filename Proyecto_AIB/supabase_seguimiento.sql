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

-- ----------------------------------------------------------------------------
-- Lista de encargos del panel
-- ----------------------------------------------------------------------------
-- Una fila ligera por encargo aceptado, con su etapa actual. El panel la pide
-- de cinco en cinco y filtra y busca aquí, sin traerse la maqueta (unos
-- 100 KB) ni el logo: esos solo hacen falta al abrir o descargar un encargo.
-- `busqueda` junta negocio, servicio y cliente en minúsculas y sin tildes.
-- security_invoker: cada uno ve lo que le dejan las políticas de proyectos y
-- seguimiento_encargos (el ingeniero, todo).
CREATE OR REPLACE VIEW public.encargos
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.created_at,
  p.payload->>'aceptado_en'          AS aceptado_en,
  p.payload->>'servicio'             AS servicio,
  p.payload->>'tipo_servicio'        AS tipo_servicio,
  p.payload->'ficha'->>'empresa'     AS empresa,
  p.payload->'ficha'->>'objetivo'    AS objetivo,
  p.payload->'ficha'->>'presupuesto' AS presupuesto,
  p.payload->'contacto'->>'nombre'   AS cliente,
  p.payload->'plantilla'             AS plantilla,
  CASE WHEN jsonb_typeof(p.payload->'historial') = 'array'
       THEN jsonb_array_length(p.payload->'historial') ELSE 0 END AS respuestas,
  COALESCE(jsonb_typeof(p.payload->'documentacion') = 'object', false) AS tiene_documentacion,
  p.payload->'documentacion'->'estimacion'->'semanas' AS semanas,
  (p.payload ? 'documento' OR p.payload ? 'html') AS tiene_maqueta,
  COALESCE(s.estado, 'recibido')     AS estado,
  translate(
    lower(concat_ws(' ', p.payload->'ficha'->>'empresa', p.payload->>'servicio', p.payload->'contacto'->>'nombre')),
    'áéíóúüñàèìòù',
    'aeiouunaeiou'
  ) AS busqueda
FROM public.proyectos p
LEFT JOIN LATERAL (
  SELECT se.estado
  FROM public.seguimiento_encargos se
  WHERE se.proyecto_id = p.id
  ORDER BY se.created_at DESC, se.id DESC
  LIMIT 1
) s ON true
WHERE p.payload->>'tipo' = 'aib-discovery'
  AND p.payload->>'aceptado' = 'true';

REVOKE ALL ON public.encargos FROM anon;
GRANT SELECT ON public.encargos TO authenticated;
