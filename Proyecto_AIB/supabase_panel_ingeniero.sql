-- ============================================================================
-- AIB+ — Panel del ingeniero
-- ============================================================================
-- Lo que usa el panel del ingeniero: la vista `encargos` (pestaña Encargos y
-- página «Hoy» de ABI) y lo de ABI: ajustes, memoria y registro.
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

-- ----------------------------------------------------------------------------
-- Ajustes de ABI
-- ----------------------------------------------------------------------------
-- Lo que ABI necesita saber del ingeniero para escribir en su nombre: cómo se
-- llama (para firmar los mensajes) y su enlace para agendar reuniones (Google
-- Calendar, Calendly…), que ABI incluye cuando propone una reunión. Cada
-- ingeniero ve y cambia solo los suyos.
CREATE TABLE IF NOT EXISTS public.ajustes_ingeniero (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  nombre        TEXT CHECK (nombre IS NULL OR char_length(nombre) BETWEEN 1 AND 80),
  enlace_agenda TEXT CHECK (enlace_agenda IS NULL OR (char_length(enlace_agenda) <= 300 AND enlace_agenda ~ '^https://')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ajustes_ingeniero ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ajustes: el ingeniero ve los suyos" ON public.ajustes_ingeniero;
CREATE POLICY "ajustes: el ingeniero ve los suyos"
  ON public.ajustes_ingeniero FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "ajustes: el ingeniero crea los suyos" ON public.ajustes_ingeniero;
CREATE POLICY "ajustes: el ingeniero crea los suyos"
  ON public.ajustes_ingeniero FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "ajustes: el ingeniero cambia los suyos" ON public.ajustes_ingeniero;
CREATE POLICY "ajustes: el ingeniero cambia los suyos"
  ON public.ajustes_ingeniero FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero())
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

REVOKE ALL ON public.ajustes_ingeniero FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.ajustes_ingeniero TO authenticated;

-- ----------------------------------------------------------------------------
-- Memoria de ABI
-- ----------------------------------------------------------------------------
-- Preferencias que el ingeniero le pide a ABI que recuerde ("nunca cobro menos
-- de S/ 1,200"). ABI las propone y solo se guardan si el ingeniero confirma;
-- las ve y las borra desde los ajustes. ABI las lee en cada pregunta.
CREATE TABLE IF NOT EXISTS public.abi_memoria (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abi_memoria_usuario_idx ON public.abi_memoria (user_id, created_at);

ALTER TABLE public.abi_memoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memoria: el ingeniero ve la suya" ON public.abi_memoria;
CREATE POLICY "memoria: el ingeniero ve la suya"
  ON public.abi_memoria FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "memoria: el ingeniero añade a la suya" ON public.abi_memoria;
CREATE POLICY "memoria: el ingeniero añade a la suya"
  ON public.abi_memoria FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "memoria: el ingeniero borra de la suya" ON public.abi_memoria;
CREATE POLICY "memoria: el ingeniero borra de la suya"
  ON public.abi_memoria FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

REVOKE ALL ON public.abi_memoria FROM anon;
GRANT SELECT, INSERT, DELETE ON public.abi_memoria TO authenticated;

-- ----------------------------------------------------------------------------
-- Registro de ABI
-- ----------------------------------------------------------------------------
-- Una fila por pregunta: qué consultó, cómo terminó, cuántos tokens usó y su
-- coste estimado. Lo escribe el servidor con la sesión del ingeniero; nadie
-- lo edita ni lo borra, para que sirva de auditoría.
CREATE TABLE IF NOT EXISTS public.abi_registro (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  pregunta              TEXT NOT NULL CHECK (char_length(pregunta) <= 300),
  herramientas          TEXT[] NOT NULL DEFAULT '{}',
  resultado             TEXT NOT NULL CHECK (resultado IN ('ok', 'rechazo', 'truncado', 'demasiadas_vueltas', 'error')),
  tokens_entrada        INTEGER NOT NULL DEFAULT 0,
  tokens_cache_escritos INTEGER NOT NULL DEFAULT 0,
  tokens_cache_leidos   INTEGER NOT NULL DEFAULT 0,
  tokens_salida         INTEGER NOT NULL DEFAULT 0,
  costo_estimado_usd    NUMERIC(10, 5) NOT NULL DEFAULT 0,
  milisegundos          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS abi_registro_usuario_idx ON public.abi_registro (user_id, created_at);

ALTER TABLE public.abi_registro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "registro: el ingeniero ve el suyo" ON public.abi_registro;
CREATE POLICY "registro: el ingeniero ve el suyo"
  ON public.abi_registro FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "registro: se anota lo del ingeniero" ON public.abi_registro;
CREATE POLICY "registro: se anota lo del ingeniero"
  ON public.abi_registro FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

REVOKE ALL ON public.abi_registro FROM anon;
GRANT SELECT, INSERT ON public.abi_registro TO authenticated;
