-- ============================================================================
-- AIB+ — Propuestas formales (cotización) e ingresos del ingeniero
-- ============================================================================
-- Tras «¡Me gusta, sigamos!», el ingeniero arma una propuesta desde el
-- encargo: precio final, plazo, qué incluye, cuánto de adelanto y hasta cuándo
-- vale. Se la manda al cliente con un enlace (/propuesta/:token) y el cliente
-- la acepta o pide cambios. Al aceptar, el encargo pasa a «En desarrollo».
--
-- AIB+ no mueve dinero: el ingeniero cobra directo a su cliente y marca aquí
-- cuándo recibió el adelanto y el saldo. Con eso tiene «Mis ingresos». El
-- administrador solo ve totales de la plataforma, no los montos de cada uno.
--
-- Ejecutar después de supabase_planes.sql. Se puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla
-- ----------------------------------------------------------------------------
-- Hasta p_max líneas de 1 a 140 caracteres, sin marcas HTML.
CREATE OR REPLACE FUNCTION public.lineas_validas(p_lineas TEXT[], p_max INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT cardinality(p_lineas) <= p_max
     AND COALESCE(bool_and(char_length(l) BETWEEN 1 AND 140 AND l !~ '[<>]'), true)
  FROM unnest(p_lineas) AS l;
$$;

CREATE TABLE IF NOT EXISTS public.propuestas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token               TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  proyecto_id         UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  -- El ingeniero del encargo (a quien le cuenta el ingreso) y quien la redactó
  -- (él o alguien de su equipo).
  ingeniero_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  precio              INTEGER NOT NULL CHECK (precio BETWEEN 1 AND 1000000),
  plazo_dias          INTEGER NOT NULL CHECK (plazo_dias BETWEEN 1 AND 365),
  incluye             TEXT[] NOT NULL DEFAULT '{}' CHECK (public.lineas_validas(incluye, 15)),
  adelanto_pct        INTEGER NOT NULL DEFAULT 50 CHECK (adelanto_pct BETWEEN 0 AND 100),
  valida_hasta        DATE NOT NULL,
  nota                TEXT CHECK (nota IS NULL OR char_length(nota) <= 800),
  estado              TEXT NOT NULL DEFAULT 'enviada'
                      CHECK (estado IN ('enviada', 'aceptada', 'cambios', 'retirada', 'reemplazada')),
  comentario_cliente  TEXT CHECK (comentario_cliente IS NULL OR char_length(comentario_cliente) <= 800),
  creada_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_en       TIMESTAMPTZ,
  adelanto_cobrado_en TIMESTAMPTZ,
  saldo_cobrado_en    TIMESTAMPTZ,
  -- Cuándo se le avisó al ingeniero de la respuesta del cliente.
  avisada_en          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS propuestas_proyecto_idx ON public.propuestas (proyecto_id);
CREATE INDEX IF NOT EXISTS propuestas_ingeniero_idx ON public.propuestas (ingeniero_id);
-- Un encargo se cierra una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS propuestas_una_aceptada ON public.propuestas (proyecto_id) WHERE estado = 'aceptada';

ALTER TABLE public.propuestas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.propuestas FROM anon, authenticated;
GRANT SELECT ON public.propuestas TO authenticated;

-- Solo lectura: se escribe con las funciones de abajo. El administrador no
-- tiene acceso a las de otros: solo a los totales.
DROP POLICY IF EXISTS "propuestas: el ingeniero y su equipo" ON public.propuestas;
CREATE POLICY "propuestas: el ingeniero y su equipo"
  ON public.propuestas FOR SELECT TO authenticated
  USING (ingeniero_id = (SELECT auth.uid()) OR ingeniero_id = (SELECT public.dueno_de_mi_equipo()));

DROP POLICY IF EXISTS "propuestas: el cliente" ON public.propuestas;
CREATE POLICY "propuestas: el cliente"
  ON public.propuestas FOR SELECT TO authenticated
  USING (cliente_id = (SELECT auth.uid()));

-- Hoy en Lima.
CREATE OR REPLACE FUNCTION public.hoy_lima()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (now() AT TIME ZONE 'America/Lima')::date;
$$;

-- ----------------------------------------------------------------------------
-- 2. El ingeniero la envía, la retira y marca lo que cobró
-- ----------------------------------------------------------------------------
-- Devuelve {estado, id, token}: 'ok', 'no_existe' o 'ya_aceptada'. Una nueva
-- reemplaza a la que estaba esperando respuesta.
CREATE OR REPLACE FUNCTION public.enviar_propuesta(
  p_proyecto UUID,
  p_precio INTEGER,
  p_plazo_dias INTEGER,
  p_incluye TEXT[],
  p_adelanto_pct INTEGER,
  p_valida_hasta DATE,
  p_nota TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proyecto public.proyectos%ROWTYPE;
  v_id       UUID;
  v_token    TEXT;
  v_etapa    TEXT;
  v_incluye  TEXT[];
BEGIN
  SELECT * INTO v_proyecto FROM public.proyectos WHERE id = p_proyecto AND payload->>'aceptado' = 'true';
  IF v_proyecto.id IS NULL OR v_proyecto.ingeniero_id IS NULL OR NOT public.es_ingeniero()
     -- COALESCE: sin equipo, dueno_de_mi_equipo() es NULL y la comparación no puede dejar pasar.
     OR NOT COALESCE(v_proyecto.ingeniero_id = auth.uid() OR v_proyecto.ingeniero_id = public.dueno_de_mi_equipo(), false) THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF EXISTS (SELECT 1 FROM public.propuestas WHERE proyecto_id = p_proyecto AND estado = 'aceptada') THEN
    RETURN jsonb_build_object('estado', 'ya_aceptada');
  END IF;
  IF p_valida_hasta IS NULL OR p_valida_hasta < public.hoy_lima() THEN
    RAISE EXCEPTION 'La fecha de validez ya pasó' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(btrim(l)) FILTER (WHERE btrim(l) <> ''), '{}') INTO v_incluye FROM unnest(p_incluye) l;

  UPDATE public.propuestas SET estado = 'reemplazada'
  WHERE proyecto_id = p_proyecto AND estado IN ('enviada', 'cambios');

  INSERT INTO public.propuestas (
    proyecto_id, ingeniero_id, autor_id, cliente_id, precio, plazo_dias, incluye, adelanto_pct, valida_hasta, nota
  ) VALUES (
    p_proyecto, v_proyecto.ingeniero_id, auth.uid(), v_proyecto.user_id, p_precio, p_plazo_dias, v_incluye,
    COALESCE(p_adelanto_pct, 50), p_valida_hasta, NULLIF(btrim(COALESCE(p_nota, '')), '')
  )
  RETURNING id, token INTO v_id, v_token;

  -- El encargo pasa a «Propuesta enviada» si aún no había llegado ahí.
  SELECT estado INTO v_etapa FROM public.seguimiento_encargos
  WHERE proyecto_id = p_proyecto ORDER BY created_at DESC, id DESC LIMIT 1;
  IF COALESCE(v_etapa, 'recibido') IN ('recibido', 'en_revision') THEN
    INSERT INTO public.seguimiento_encargos (proyecto_id, estado, nota, autor_id)
    VALUES (p_proyecto, 'propuesta_enviada', NULL, auth.uid());
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'id', v_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.retirar_propuesta(p_propuesta UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.propuestas SET estado = 'retirada'
  WHERE id = p_propuesta
    AND estado IN ('enviada', 'cambios')
    AND (ingeniero_id = auth.uid() OR ingeniero_id = public.dueno_de_mi_equipo());
  RETURN FOUND;
END;
$$;

-- p_tipo: 'adelanto' o 'saldo'. Marcar o desmarcar que lo recibió.
CREATE OR REPLACE FUNCTION public.marcar_cobro_propuesta(p_propuesta UUID, p_tipo TEXT, p_valor BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_tipo NOT IN ('adelanto', 'saldo') THEN
    RAISE EXCEPTION 'Tipo de cobro no válido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.propuestas SET
    adelanto_cobrado_en = CASE WHEN p_tipo = 'adelanto' THEN (CASE WHEN p_valor THEN COALESCE(adelanto_cobrado_en, now()) END) ELSE adelanto_cobrado_en END,
    saldo_cobrado_en    = CASE WHEN p_tipo = 'saldo'    THEN (CASE WHEN p_valor THEN COALESCE(saldo_cobrado_en, now()) END)    ELSE saldo_cobrado_en END
  WHERE id = p_propuesta
    AND estado = 'aceptada'
    AND (ingeniero_id = auth.uid() OR ingeniero_id = public.dueno_de_mi_equipo());
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_propuesta(UUID, INTEGER, INTEGER, TEXT[], INTEGER, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retirar_propuesta(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_cobro_propuesta(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_propuesta(UUID, INTEGER, INTEGER, TEXT[], INTEGER, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retirar_propuesta(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_cobro_propuesta(UUID, TEXT, BOOLEAN) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. El cliente la ve y responde con el enlace (también sin sesión)
-- ----------------------------------------------------------------------------
-- 'vencida' se calcula: enviada y con la fecha de validez ya pasada.
CREATE OR REPLACE FUNCTION public.propuesta_por_token(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', pr.id,
    'estado', CASE WHEN pr.estado = 'enviada' AND pr.valida_hasta < public.hoy_lima() THEN 'vencida' ELSE pr.estado END,
    'precio', pr.precio,
    'plazo_dias', pr.plazo_dias,
    'incluye', to_jsonb(pr.incluye),
    'adelanto_pct', pr.adelanto_pct,
    'valida_hasta', pr.valida_hasta,
    'nota', pr.nota,
    'comentario_cliente', pr.comentario_cliente,
    'creada_en', pr.creada_en,
    'respondida_en', pr.respondida_en,
    'negocio', COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio'),
    'cliente', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
    'ingeniero', jsonb_build_object(
      'nombre', COALESCE(pi.nombre, 'AIB+'),
      'titular', pi.titular,
      'foto_url', pi.foto_url,
      'slug', CASE WHEN pi.estado = 'aprobado' THEN pi.slug END
    )
  )
  FROM public.propuestas pr
  JOIN public.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pr.ingeniero_id
  WHERE p_token ~ '^[0-9a-f]{32}$' AND pr.token = p_token;
$$;

-- Devuelve {estado}: 'ok', 'no_existe', 'vencida' o 'ya_respondida'. Pedir
-- cambios necesita un comentario.
CREATE OR REPLACE FUNCTION public.responder_propuesta(p_token TEXT, p_acepta BOOLEAN, p_comentario TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pr public.propuestas%ROWTYPE;
  v_comentario TEXT := NULLIF(btrim(COALESCE(p_comentario, '')), '');
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  SELECT * INTO v_pr FROM public.propuestas WHERE token = p_token FOR UPDATE;
  IF v_pr.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF v_pr.estado <> 'enviada' THEN
    RETURN jsonb_build_object('estado', 'ya_respondida');
  END IF;
  IF v_pr.valida_hasta < public.hoy_lima() THEN
    RETURN jsonb_build_object('estado', 'vencida');
  END IF;

  IF COALESCE(p_acepta, false) THEN
    UPDATE public.propuestas
    SET estado = 'aceptada', respondida_en = now(), comentario_cliente = v_comentario, avisada_en = NULL
    WHERE id = v_pr.id;
    -- El encargo pasa a «En desarrollo» (a nombre del ingeniero).
    INSERT INTO public.seguimiento_encargos (proyecto_id, estado, nota, autor_id)
    VALUES (v_pr.proyecto_id, 'en_desarrollo', NULL, v_pr.ingeniero_id);
  ELSE
    IF v_comentario IS NULL OR char_length(v_comentario) < 3 THEN
      RAISE EXCEPTION 'Cuéntale al ingeniero qué te gustaría cambiar' USING ERRCODE = '22023';
    END IF;
    UPDATE public.propuestas
    SET estado = 'cambios', respondida_en = now(), comentario_cliente = left(v_comentario, 800), avisada_en = NULL
    WHERE id = v_pr.id;
  END IF;

  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.propuesta_por_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.responder_propuesta(TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propuesta_por_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.responder_propuesta(TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- Para la tarjeta del enlace en WhatsApp (el servidor, sin sesión).
CREATE OR REPLACE FUNCTION public.vista_previa_propuesta(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio'),
    'ingeniero', split_part(COALESCE(pi.nombre, 'AIB+'), ' ', 1)
  )
  FROM public.propuestas pr
  JOIN public.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pr.ingeniero_id
  WHERE p_token ~ '^[0-9a-f]{32}$' AND pr.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.vista_previa_propuesta(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vista_previa_propuesta(TEXT) TO anon, authenticated;

-- El servidor avisa al ingeniero por WhatsApp de que el cliente respondió.
-- Protegida con la clave del servidor; marca el aviso para no repetirlo.
CREATE OR REPLACE FUNCTION public.aviso_respuesta_propuesta(p_clave TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fila JSONB;
  v_id   UUID;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN jsonb_build_object('estado', 'clave_invalida');
  END IF;

  SELECT pr.id, jsonb_build_object(
    'estado', 'ok',
    'respuesta', pr.estado,
    'comentario', pr.comentario_cliente,
    'precio', pr.precio,
    'negocio', COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio'),
    'es_admin', public.es_admin_id(pr.ingeniero_id),
    'nombre', split_part(COALESCE(pi.nombre, ''), ' ', 1),
    'whatsapp', regexp_replace(COALESCE(pi.whatsapp, ''), '[^0-9]', '', 'g'),
    'apikey', a.callmebot_apikey
  )
  INTO v_id, v_fila
  FROM public.propuestas pr
  JOIN public.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pr.ingeniero_id
  LEFT JOIN public.avisos_ingeniero a ON a.user_id = pr.ingeniero_id
  WHERE p_token ~ '^[0-9a-f]{32}$' AND pr.token = p_token
    AND pr.estado IN ('aceptada', 'cambios')
    AND pr.avisada_en IS NULL
  FOR UPDATE OF pr;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('estado', 'nada');
  END IF;
  UPDATE public.propuestas SET avisada_en = now() WHERE id = v_id;
  RETURN v_fila;
END;
$$;

REVOKE ALL ON FUNCTION public.aviso_respuesta_propuesta(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aviso_respuesta_propuesta(TEXT, TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. «Mis ingresos» (el ingeniero) y los totales (el administrador)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mis_ingresos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mias AS (
    SELECT pr.*,
      round(pr.precio * pr.adelanto_pct / 100.0)::INTEGER AS monto_adelanto,
      pr.precio - round(pr.precio * pr.adelanto_pct / 100.0)::INTEGER AS monto_saldo,
      COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio') AS negocio,
      CASE WHEN pr.estado = 'enviada' AND pr.valida_hasta < public.hoy_lima() THEN 'vencida' ELSE pr.estado END AS estado_real
    FROM public.propuestas pr
    JOIN public.proyectos p ON p.id = pr.proyecto_id
    WHERE public.es_ingeniero()
      AND (pr.ingeniero_id = auth.uid() OR pr.ingeniero_id = public.dueno_de_mi_equipo())
  ),
  mes AS (
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima' AS desde
  )
  SELECT jsonb_build_object(
    'vendido_mes', COALESCE((SELECT sum(precio) FROM mias, mes WHERE estado = 'aceptada' AND respondida_en >= mes.desde), 0),
    'cobrado_mes', COALESCE((
      SELECT sum(CASE WHEN adelanto_cobrado_en >= mes.desde THEN monto_adelanto ELSE 0 END
               + CASE WHEN saldo_cobrado_en >= mes.desde THEN monto_saldo ELSE 0 END)
      FROM mias, mes WHERE estado = 'aceptada'
    ), 0),
    'por_cobrar', COALESCE((
      SELECT sum(CASE WHEN adelanto_cobrado_en IS NULL THEN monto_adelanto ELSE 0 END
               + CASE WHEN saldo_cobrado_en IS NULL THEN monto_saldo ELSE 0 END)
      FROM mias WHERE estado = 'aceptada'
    ), 0),
    'esperando', (SELECT count(*) FROM mias WHERE estado_real = 'enviada'),
    'esperando_monto', COALESCE((SELECT sum(precio) FROM mias WHERE estado_real = 'enviada'), 0),
    'aceptadas', (SELECT count(*) FROM mias WHERE estado = 'aceptada'),
    'respondidas', (SELECT count(*) FROM mias WHERE estado IN ('aceptada', 'cambios') OR estado_real = 'vencida'),
    'ticket_promedio', (SELECT round(avg(precio)) FROM mias WHERE estado = 'aceptada'),
    'propuestas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'token', token, 'proyecto_id', proyecto_id, 'negocio', negocio, 'estado', estado_real,
        'precio', precio, 'plazo_dias', plazo_dias, 'adelanto_pct', adelanto_pct,
        'monto_adelanto', monto_adelanto, 'monto_saldo', monto_saldo,
        'creada_en', creada_en, 'respondida_en', respondida_en,
        'adelanto_cobrado_en', adelanto_cobrado_en, 'saldo_cobrado_en', saldo_cobrado_en
      ) ORDER BY creada_en DESC)
      FROM mias WHERE estado NOT IN ('reemplazada', 'retirada')
    ), '[]'::jsonb)
  );
$$;

-- Solo totales: el administrador no ve los montos de cada ingeniero.
CREATE OR REPLACE FUNCTION public.totales_propuestas()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'aceptado_total', COALESCE(sum(precio) FILTER (WHERE estado = 'aceptada'), 0),
      'aceptado_mes', COALESCE(sum(precio) FILTER (WHERE estado = 'aceptada' AND respondida_en >= v_mes), 0),
      'enviadas', count(*) FILTER (WHERE estado NOT IN ('reemplazada', 'retirada')),
      'aceptadas', count(*) FILTER (WHERE estado = 'aceptada'),
      'ticket_promedio', round(avg(precio) FILTER (WHERE estado = 'aceptada')),
      'dias_para_cerrar', round((avg(EXTRACT(EPOCH FROM (respondida_en - creada_en)) / 86400) FILTER (WHERE estado = 'aceptada'))::numeric, 1),
      'ingenieros_con_ventas', count(DISTINCT ingeniero_id) FILTER (WHERE estado = 'aceptada')
    )
    FROM public.propuestas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mis_ingresos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.totales_propuestas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_ingresos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.totales_propuestas() TO authenticated;
