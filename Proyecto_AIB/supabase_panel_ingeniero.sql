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

-- ----------------------------------------------------------------------------
-- Resumen de cada mañana
-- ----------------------------------------------------------------------------
-- A las 8:00 el cron de Vercel le pide a ABI el resumen y el servidor se lo
-- manda al ingeniero por WhatsApp. A esa hora no hay sesión de nadie, así que
-- la función exige una clave: el servidor manda la suya (CRON_SECRET) y aquí
-- solo se guarda su huella SHA-256, en una tabla que nadie lee por la API.
-- Para poner o cambiar la clave:
--   INSERT INTO public.claves_sistema (nombre, huella)
--   VALUES ('resumen_diario', encode(sha256(convert_to('<CRON_SECRET>', 'UTF8')), 'hex'))
--   ON CONFLICT (nombre) DO UPDATE SET huella = EXCLUDED.huella;
ALTER TABLE public.ajustes_ingeniero ADD COLUMN IF NOT EXISTS resumen_diario BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.claves_sistema (
  nombre TEXT PRIMARY KEY,
  huella TEXT NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.claves_sistema ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claves_sistema FROM anon, authenticated;

-- Solo clientes reales (sin las pruebas del ingeniero). De momento hay un
-- ingeniero: el resumen es el suyo y va al WhatsApp de AVISOS_WHATSAPP.
CREATE OR REPLACE FUNCTION public.resumen_del_dia(p_clave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_huella    TEXT;
  v_ingeniero UUID;
  v_ajustes   public.ajustes_ingeniero%ROWTYPE;
  v_ayer      TIMESTAMPTZ := now() - interval '1 day';
BEGIN
  SELECT huella INTO v_huella FROM public.claves_sistema WHERE nombre = 'resumen_diario';
  IF v_huella IS NULL OR p_clave IS NULL OR encode(sha256(convert_to(p_clave, 'UTF8')), 'hex') <> v_huella THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  SELECT user_id INTO v_ingeniero FROM public.perfiles WHERE rol = 'ingeniero' ORDER BY created_at LIMIT 1;
  SELECT * INTO v_ajustes FROM public.ajustes_ingeniero WHERE user_id = v_ingeniero;

  RETURN jsonb_build_object(
    'estado', 'ok',
    'activo', COALESCE(v_ajustes.resumen_diario, true),
    'nombre', v_ajustes.nombre,
    'esperando', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.desde), '[]'::jsonb) FROM (
        SELECT COALESCE(e.empresa, e.cliente, e.servicio) AS negocio,
               COALESCE(e.aceptado_en::timestamptz, e.created_at) AS desde
        FROM public.encargos e
        WHERE e.estado = 'recibido' AND NOT e.es_prueba
        ORDER BY 2
        LIMIT 5
      ) x
    ),
    'total_esperando', (SELECT count(*) FROM public.encargos e WHERE e.estado = 'recibido' AND NOT e.es_prueba),
    'invitaciones_a_medias', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT i.negocio,
               CASE
                 WHEN i.maqueta_en IS NOT NULL THEN 'vio su web, no aceptó'
                 WHEN i.empezada_en IS NOT NULL THEN 'empezó, no llegó a ver su web'
                 WHEN i.abierta_en IS NOT NULL THEN 'abrió el enlace, no empezó'
                 ELSE 'no abrió el enlace'
               END AS donde
        FROM public.invitaciones_resumen i
        -- Las pruebas desde la portada no: no hay a quién escribirle.
        WHERE i.activa AND NOT i.es_prueba AND i.aceptada_en IS NULL AND i.origen = 'ingeniero'
        ORDER BY i.created_at DESC
        LIMIT 3
      ) x
    ),
    'total_invitaciones_a_medias', (
      SELECT count(*) FROM public.invitaciones_resumen i
      WHERE i.activa AND NOT i.es_prueba AND i.aceptada_en IS NULL AND i.origen = 'ingeniero'
    ),
    'encargos_nuevos_24h', (
      SELECT count(*) FROM public.encargos e
      WHERE NOT e.es_prueba AND COALESCE(e.aceptado_en::timestamptz, e.created_at) > v_ayer
    ),
    'comentarios_24h', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.payload->'ficha'->>'empresa' AS negocio, c.reaccion, left(c.texto, 120) AS texto
        FROM public.comentarios c
        LEFT JOIN public.proyectos p ON p.id = c.proyecto_id
        WHERE c.created_at > v_ayer
        ORDER BY c.created_at DESC
        LIMIT 3
      ) x
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resumen_del_dia(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumen_del_dia(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Embudo del cliente
-- ----------------------------------------------------------------------------
-- Hasta dónde llega cada intento del cuestionario web: una fila por intento
-- (la crea el navegador con un id al azar al abrir el cuestionario) con el
-- paso más lejano al que llegó. No guarda ninguna respuesta. Los pasos los
-- define el panel (lib/embudo.ts): las 7 preguntas, terminar el cuestionario,
-- ver la maqueta, pulsar «¡Me gusta, sigamos!» y aceptar. `orden` es su
-- posición, así el paso más lejano es el de mayor orden.
-- Los intentos del ingeniero y de las invitaciones de prueba se marcan como
-- prueba al crearse y no cuentan.
CREATE TABLE IF NOT EXISTS public.progreso_cuestionario (
  sesion         UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitacion_id  UUID REFERENCES public.invitaciones(id) ON DELETE SET NULL,
  es_prueba      BOOLEAN NOT NULL DEFAULT false,
  paso           TEXT NOT NULL CHECK (paso ~ '^[a-z0-9_-]{1,40}$'),
  orden          INTEGER NOT NULL CHECK (orden BETWEEN 0 AND 50),
  empezado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sin políticas: solo se escribe con registrar_progreso y se lee con
-- embudo_cliente.
ALTER TABLE public.progreso_cuestionario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.progreso_cuestionario FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_progreso(p_sesion UUID, p_paso TEXT, p_orden INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv    public.invitaciones%ROWTYPE;
  v_prueba BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_sesion IS NULL OR p_paso IS NULL
     OR p_paso !~ '^[a-z0-9_-]{1,40}$' OR p_orden IS NULL OR p_orden NOT BETWEEN 0 AND 50 THEN
    RETURN;
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones WHERE cliente_id = auth.uid() LIMIT 1;
  v_prueba := EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = auth.uid() AND rol = 'ingeniero')
              OR COALESCE(v_inv.es_prueba, false);

  INSERT INTO public.progreso_cuestionario AS p (sesion, user_id, invitacion_id, es_prueba, paso, orden)
  VALUES (p_sesion, auth.uid(), v_inv.id, v_prueba, p_paso, p_orden)
  ON CONFLICT (sesion) DO UPDATE
    SET paso = CASE WHEN EXCLUDED.orden > p.orden THEN EXCLUDED.paso ELSE p.paso END,
        orden = GREATEST(p.orden, EXCLUDED.orden),
        actualizado_en = now()
    WHERE p.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_progreso(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_progreso(UUID, TEXT, INTEGER) TO authenticated;

-- Lo que ve el ingeniero: cuántos intentos reales llegaron a cada paso y
-- cómo circulan los enlaces compartidos de clientes reales.
CREATE OR REPLACE FUNCTION public.embudo_cliente()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero ve el embudo' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'desde', (SELECT min(empezado_en) FROM public.progreso_cuestionario),
    'intentos', (SELECT count(*) FROM public.progreso_cuestionario WHERE NOT es_prueba),
    'por_orden', (
      SELECT COALESCE(jsonb_object_agg(orden, n), '{}'::jsonb) FROM (
        SELECT orden, count(*) AS n FROM public.progreso_cuestionario WHERE NOT es_prueba GROUP BY orden
      ) x
    ),
    'enlaces', (
      SELECT jsonb_build_object(
        'creados', count(*),
        'abiertos', count(*) FILTER (WHERE e.aperturas > 0),
        'aperturas', COALESCE(sum(e.aperturas), 0),
        'lista', COALESCE(
          jsonb_agg(
            jsonb_build_object('negocio', e.empresa, 'aperturas', e.aperturas, 'ultima', e.ultima_apertura)
            ORDER BY e.aperturas DESC, e.created_at DESC
          ) FILTER (WHERE e.aperturas > 0),
          '[]'::jsonb
        )
      )
      FROM (
        SELECT ec.aperturas, ec.ultima_apertura, ec.created_at, p.payload->'ficha'->>'empresa' AS empresa
        FROM public.enlaces_compartidos ec
        JOIN public.proyectos p ON p.id = ec.proyecto_id
        WHERE NOT EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.user_id = ec.user_id AND pf.rol = 'ingeniero')
          AND NOT EXISTS (SELECT 1 FROM public.invitaciones i WHERE i.cliente_id = ec.user_id AND i.es_prueba)
      ) e
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.embudo_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embudo_cliente() TO authenticated;
