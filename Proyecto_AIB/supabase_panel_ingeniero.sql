-- ============================================================================
-- AIB+ — Panel del ingeniero
-- ============================================================================
-- Lo que lee el panel del ingeniero de un vistazo: la vista `encargos`, que
-- usan la pestaña Encargos y la página «Hoy» de ABI.
--
-- Ejecutar después de supabase_seguimiento.sql y supabase_invitaciones.sql
-- (usa seguimiento_encargos, perfiles e invitaciones). Se puede ejecutar más
-- de una vez.
-- ============================================================================

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
  ) AS busqueda,
  p.payload->'contacto'->>'whatsapp' AS whatsapp,
  -- De prueba: lo hizo un ingeniero con su propia cuenta, o un invitado de
  -- una invitación marcada como prueba. ABI no avisa de estos.
  (
    EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.user_id = p.user_id AND pf.rol = 'ingeniero')
    OR EXISTS (SELECT 1 FROM public.invitaciones i WHERE i.cliente_id = p.user_id AND i.es_prueba)
  ) AS es_prueba
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
