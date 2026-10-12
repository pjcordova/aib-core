-- ============================================================================
-- AIB+ — Propuestas por etapas (entregas con aprobación del cliente)
-- ============================================================================
-- Además de «adelanto y saldo», la propuesta puede pagarse por etapas: de 2 a
-- 5 hitos (por ejemplo Diseño 30 %, Desarrollo 40 %, Publicación 30 %), cada
-- uno con su plazo. Con la propuesta aceptada:
--   1. el ingeniero marca la entrega de un hito (con una nota y un enlace),
--   2. el cliente la revisa con el mismo enlace de la propuesta (sin cuenta) y
--      la aprueba o pide ajustes,
--   3. el ingeniero marca cuándo cobró cada hito.
-- El cliente con cuenta recibe un correo con cada entrega (avisos_cliente) y
-- el ingeniero, un WhatsApp con cada respuesta (aviso_respuesta_entrega).
--
-- Las propuestas de siempre (adelanto y saldo) no cambian: una propuesta va
-- por etapas si tiene hitos, y entonces su adelanto_pct es 0.
--
-- Redefine propuesta_por_token y mis_ingresos (supabase_propuestas.sql) con
-- los hitos. Ejecutar después de supabase_propuestas.sql y
-- supabase_avisos_cliente.sql. Se puede ejecutar más de una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hitos_propuesta (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id      UUID NOT NULL REFERENCES public.propuestas(id) ON DELETE CASCADE,
  orden             SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 5),
  titulo            TEXT NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 2 AND 60 AND titulo !~ '[<>]'),
  porcentaje        SMALLINT NOT NULL CHECK (porcentaje BETWEEN 1 AND 100),
  -- En soles; el último hito se lleva el redondeo para que sumen el precio.
  monto             INTEGER NOT NULL CHECK (monto >= 0),
  dias              SMALLINT NOT NULL CHECK (dias BETWEEN 1 AND 365),
  estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'entregado', 'aprobado', 'ajustes')),
  entrega_nota      TEXT CHECK (entrega_nota IS NULL OR (char_length(entrega_nota) <= 500 AND entrega_nota !~ '[<>]')),
  entrega_enlace    TEXT CHECK (entrega_enlace IS NULL OR (entrega_enlace ~* '^https?://[^[:space:]<>"]{3,}$' AND char_length(entrega_enlace) <= 300)),
  entregado_en      TIMESTAMPTZ,
  respuesta_cliente TEXT CHECK (respuesta_cliente IS NULL OR char_length(respuesta_cliente) <= 500),
  respondido_en     TIMESTAMPTZ,
  cobrado_en        TIMESTAMPTZ,
  -- Cuándo se le avisó al ingeniero de la respuesta del cliente.
  avisado_en        TIMESTAMPTZ,
  UNIQUE (propuesta_id, orden)
);

ALTER TABLE public.hitos_propuesta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hitos_propuesta FROM anon, authenticated;
GRANT SELECT ON public.hitos_propuesta TO authenticated;

-- Los ven quienes ven la propuesta (el ingeniero, su equipo y el cliente).
DROP POLICY IF EXISTS "hitos: quien ve la propuesta" ON public.hitos_propuesta;
CREATE POLICY "hitos: quien ve la propuesta"
  ON public.hitos_propuesta FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.propuestas pr WHERE pr.id = hitos_propuesta.propuesta_id));


-- ----------------------------------------------------------------------------
-- 1. El ingeniero envía la propuesta por etapas
-- ----------------------------------------------------------------------------
-- p_hitos: [{titulo, porcentaje, dias}, …], de 2 a 5, que sumen 100 %. El
-- plazo total es la suma de los días. Devuelve lo mismo que enviar_propuesta.
CREATE OR REPLACE FUNCTION public.enviar_propuesta_por_etapas(
  p_proyecto UUID,
  p_precio INTEGER,
  p_incluye TEXT[],
  p_valida_hasta DATE,
  p_nota TEXT,
  p_hitos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n         INTEGER;
  v_h         JSONB;
  v_total     INTEGER := 0;
  v_dias      INTEGER := 0;
  v_i         INTEGER := 0;
  v_acumulado INTEGER := 0;
  v_monto     INTEGER;
  v_resultado JSONB;
BEGIN
  IF p_hitos IS NULL OR jsonb_typeof(p_hitos) <> 'array' THEN
    RAISE EXCEPTION 'Faltan las etapas' USING ERRCODE = '22023';
  END IF;
  v_n := jsonb_array_length(p_hitos);
  IF v_n < 2 OR v_n > 5 THEN
    RAISE EXCEPTION 'La propuesta va de 2 a 5 etapas' USING ERRCODE = '22023';
  END IF;

  FOR v_h IN SELECT * FROM jsonb_array_elements(p_hitos) LOOP
    IF char_length(btrim(COALESCE(v_h->>'titulo', ''))) NOT BETWEEN 2 AND 60
       OR COALESCE(v_h->>'porcentaje', '') !~ '^\d{1,3}$'
       OR COALESCE(v_h->>'dias', '') !~ '^\d{1,3}$'
       OR (v_h->>'porcentaje')::INTEGER NOT BETWEEN 1 AND 100
       OR (v_h->>'dias')::INTEGER NOT BETWEEN 1 AND 365 THEN
      RAISE EXCEPTION 'Revisa cada etapa: nombre, porcentaje y días' USING ERRCODE = '22023';
    END IF;
    v_total := v_total + (v_h->>'porcentaje')::INTEGER;
    v_dias := v_dias + (v_h->>'dias')::INTEGER;
  END LOOP;
  IF v_total <> 100 THEN
    RAISE EXCEPTION 'Los porcentajes de las etapas deben sumar 100' USING ERRCODE = '22023';
  END IF;
  IF v_dias > 365 THEN
    RAISE EXCEPTION 'Las etapas suman más de un año' USING ERRCODE = '22023';
  END IF;

  -- Los mismos permisos y efectos que una propuesta normal, sin adelanto.
  v_resultado := public.enviar_propuesta(p_proyecto, p_precio, v_dias, p_incluye, 0, p_valida_hasta, p_nota);
  IF v_resultado->>'estado' <> 'ok' THEN
    RETURN v_resultado;
  END IF;

  FOR v_h IN SELECT * FROM jsonb_array_elements(p_hitos) LOOP
    v_i := v_i + 1;
    v_monto := CASE WHEN v_i = v_n THEN p_precio - v_acumulado
                    ELSE round(p_precio * (v_h->>'porcentaje')::INTEGER / 100.0)::INTEGER END;
    v_acumulado := v_acumulado + v_monto;
    INSERT INTO public.hitos_propuesta (propuesta_id, orden, titulo, porcentaje, monto, dias)
    VALUES ((v_resultado->>'id')::UUID, v_i, btrim(v_h->>'titulo'), (v_h->>'porcentaje')::INTEGER, v_monto, (v_h->>'dias')::INTEGER);
  END LOOP;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_propuesta_por_etapas(UUID, INTEGER, TEXT[], DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_propuesta_por_etapas(UUID, INTEGER, TEXT[], DATE, TEXT, JSONB) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. El ingeniero entrega un hito y marca su cobro
-- ----------------------------------------------------------------------------
-- 'ok', 'no_existe', 'no_aceptada' o 'ya_aprobado'. El cliente con cuenta
-- recibe un correo (avisos_cliente, estado 'entrega').
CREATE OR REPLACE FUNCTION public.entregar_hito(p_hito UUID, p_nota TEXT, p_enlace TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_h        public.hitos_propuesta%ROWTYPE;
  v_pr       public.propuestas%ROWTYPE;
BEGIN
  SELECT * INTO v_h FROM public.hitos_propuesta WHERE id = p_hito FOR UPDATE;
  IF v_h.id IS NULL THEN
    RETURN 'no_existe';
  END IF;
  SELECT * INTO v_pr FROM public.propuestas WHERE id = v_h.propuesta_id;
  IF NOT COALESCE(v_pr.ingeniero_id = auth.uid() OR v_pr.ingeniero_id = public.dueno_de_mi_equipo(), false) THEN
    RETURN 'no_existe';
  END IF;
  IF v_pr.estado <> 'aceptada' THEN
    RETURN 'no_aceptada';
  END IF;
  IF v_h.estado = 'aprobado' THEN
    RETURN 'ya_aprobado';
  END IF;

  UPDATE public.hitos_propuesta SET
    estado = 'entregado',
    entregado_en = now(),
    entrega_nota = NULLIF(btrim(left(COALESCE(p_nota, ''), 500)), ''),
    entrega_enlace = NULLIF(btrim(COALESCE(p_enlace, '')), ''),
    respuesta_cliente = NULL,
    respondido_en = NULL,
    avisado_en = NULL
  WHERE id = v_h.id;

  INSERT INTO public.avisos_cliente (proyecto_id, estado, nota) VALUES (v_pr.proyecto_id, 'entrega', v_h.titulo);
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_cobro_hito(p_hito UUID, p_valor BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.hitos_propuesta h
  SET cobrado_en = CASE WHEN p_valor THEN COALESCE(h.cobrado_en, now()) END
  FROM public.propuestas pr
  WHERE h.id = p_hito
    AND pr.id = h.propuesta_id
    AND pr.estado = 'aceptada'
    AND COALESCE(pr.ingeniero_id = auth.uid() OR pr.ingeniero_id = public.dueno_de_mi_equipo(), false);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.entregar_hito(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marcar_cobro_hito(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entregar_hito(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_cobro_hito(UUID, BOOLEAN) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. El cliente revisa la entrega con el enlace (también sin sesión)
-- ----------------------------------------------------------------------------
-- 'ok', 'no_existe' o 'no_entregado'. Pedir ajustes necesita un comentario.
CREATE OR REPLACE FUNCTION public.responder_entrega(p_token TEXT, p_hito UUID, p_aprueba BOOLEAN, p_comentario TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_h          public.hitos_propuesta%ROWTYPE;
  v_comentario TEXT := NULLIF(btrim(COALESCE(p_comentario, '')), '');
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN 'no_existe';
  END IF;
  SELECT h.* INTO v_h
  FROM public.hitos_propuesta h
  JOIN public.propuestas pr ON pr.id = h.propuesta_id
  WHERE h.id = p_hito AND pr.token = p_token AND pr.estado = 'aceptada'
  FOR UPDATE OF h;
  IF v_h.id IS NULL THEN
    RETURN 'no_existe';
  END IF;
  IF v_h.estado <> 'entregado' THEN
    RETURN 'no_entregado';
  END IF;

  IF COALESCE(p_aprueba, false) THEN
    UPDATE public.hitos_propuesta
    SET estado = 'aprobado', respondido_en = now(), respuesta_cliente = left(v_comentario, 500), avisado_en = NULL
    WHERE id = v_h.id;
  ELSE
    IF v_comentario IS NULL OR char_length(v_comentario) < 3 THEN
      RAISE EXCEPTION 'Cuéntale al ingeniero qué ajustar' USING ERRCODE = '22023';
    END IF;
    UPDATE public.hitos_propuesta
    SET estado = 'ajustes', respondido_en = now(), respuesta_cliente = left(v_comentario, 500), avisado_en = NULL
    WHERE id = v_h.id;
  END IF;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.responder_entrega(TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.responder_entrega(TEXT, UUID, BOOLEAN, TEXT) TO anon, authenticated;

-- El servidor avisa al ingeniero, por correo y por WhatsApp, de que el cliente
-- respondió una entrega. Protegida con la clave del servidor; marca el aviso.
CREATE OR REPLACE FUNCTION public.aviso_respuesta_entrega(p_clave TEXT, p_token TEXT)
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

  SELECT h.id, jsonb_build_object(
    'estado', 'ok',
    'respuesta', h.estado,
    'titulo', h.titulo,
    'comentario', h.respuesta_cliente,
    'negocio', COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio'),
    'es_admin', public.es_admin_id(pr.ingeniero_id),
    'nombre', split_part(COALESCE(pi.nombre, ''), ' ', 1),
    'whatsapp', regexp_replace(COALESCE(pi.whatsapp, ''), '[^0-9]', '', 'g'),
    'apikey', a.callmebot_apikey,
    'correo', (SELECT NULLIF(u.email, '') FROM auth.users u WHERE u.id = pr.ingeniero_id)
  )
  INTO v_id, v_fila
  FROM public.hitos_propuesta h
  JOIN public.propuestas pr ON pr.id = h.propuesta_id
  JOIN public.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pr.ingeniero_id
  LEFT JOIN public.avisos_ingeniero a ON a.user_id = pr.ingeniero_id
  WHERE p_token ~ '^[0-9a-f]{32}$' AND pr.token = p_token
    AND h.estado IN ('aprobado', 'ajustes')
    AND h.avisado_en IS NULL
  ORDER BY h.respondido_en
  LIMIT 1
  FOR UPDATE OF h;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('estado', 'nada');
  END IF;
  UPDATE public.hitos_propuesta SET avisado_en = now() WHERE id = v_id;
  RETURN v_fila;
END;
$$;

REVOKE ALL ON FUNCTION public.aviso_respuesta_entrega(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aviso_respuesta_entrega(TEXT, TEXT) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. La propuesta del cliente y «Mis ingresos», con los hitos
-- ----------------------------------------------------------------------------
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
    ),
    'hitos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'orden', h.orden, 'titulo', h.titulo, 'porcentaje', h.porcentaje, 'monto', h.monto,
        'dias', h.dias, 'estado', h.estado, 'entrega_nota', h.entrega_nota, 'entrega_enlace', h.entrega_enlace,
        'entregado_en', h.entregado_en, 'respuesta_cliente', h.respuesta_cliente, 'respondido_en', h.respondido_en
      ) ORDER BY h.orden)
      FROM public.hitos_propuesta h WHERE h.propuesta_id = pr.id
    ), '[]'::jsonb)
  )
  FROM public.propuestas pr
  JOIN public.proyectos p ON p.id = pr.proyecto_id
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pr.ingeniero_id
  WHERE p_token ~ '^[0-9a-f]{32}$' AND pr.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.propuesta_por_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propuesta_por_token(TEXT) TO anon, authenticated;

-- Por etapas: el adelanto y el saldo valen 0 y se cobra cada hito.
CREATE OR REPLACE FUNCTION public.mis_ingresos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mias AS (
    SELECT pr.*,
      EXISTS (SELECT 1 FROM public.hitos_propuesta h WHERE h.propuesta_id = pr.id) AS por_etapas,
      COALESCE(NULLIF(p.payload->'ficha'->>'empresa', ''), p.payload->>'servicio') AS negocio,
      CASE WHEN pr.estado = 'enviada' AND pr.valida_hasta < public.hoy_lima() THEN 'vencida' ELSE pr.estado END AS estado_real
    FROM public.propuestas pr
    JOIN public.proyectos p ON p.id = pr.proyecto_id
    WHERE public.es_ingeniero()
      AND (pr.ingeniero_id = auth.uid() OR pr.ingeniero_id = public.dueno_de_mi_equipo())
  ),
  montos AS (
    SELECT m.*,
      CASE WHEN m.por_etapas THEN 0 ELSE round(m.precio * m.adelanto_pct / 100.0)::INTEGER END AS monto_adelanto,
      CASE WHEN m.por_etapas THEN 0 ELSE m.precio - round(m.precio * m.adelanto_pct / 100.0)::INTEGER END AS monto_saldo
    FROM mias m
  ),
  hitos AS (
    SELECT h.*, m.estado AS estado_propuesta
    FROM public.hitos_propuesta h
    JOIN mias m ON m.id = h.propuesta_id
  ),
  mes AS (
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima' AS desde
  )
  SELECT jsonb_build_object(
    'vendido_mes', COALESCE((SELECT sum(precio) FROM montos, mes WHERE estado = 'aceptada' AND respondida_en >= mes.desde), 0),
    'cobrado_mes', COALESCE((
      SELECT sum(CASE WHEN adelanto_cobrado_en >= mes.desde THEN monto_adelanto ELSE 0 END
               + CASE WHEN saldo_cobrado_en >= mes.desde THEN monto_saldo ELSE 0 END)
      FROM montos, mes WHERE estado = 'aceptada'
    ), 0) + COALESCE((
      SELECT sum(h.monto) FROM hitos h, mes WHERE h.estado_propuesta = 'aceptada' AND h.cobrado_en >= mes.desde
    ), 0),
    'por_cobrar', COALESCE((
      SELECT sum(CASE WHEN adelanto_cobrado_en IS NULL THEN monto_adelanto ELSE 0 END
               + CASE WHEN saldo_cobrado_en IS NULL THEN monto_saldo ELSE 0 END)
      FROM montos WHERE estado = 'aceptada'
    ), 0) + COALESCE((
      SELECT sum(h.monto) FROM hitos h WHERE h.estado_propuesta = 'aceptada' AND h.cobrado_en IS NULL
    ), 0),
    'esperando', (SELECT count(*) FROM montos WHERE estado_real = 'enviada'),
    'esperando_monto', COALESCE((SELECT sum(precio) FROM montos WHERE estado_real = 'enviada'), 0),
    'aceptadas', (SELECT count(*) FROM montos WHERE estado = 'aceptada'),
    'respondidas', (SELECT count(*) FROM montos WHERE estado IN ('aceptada', 'cambios') OR estado_real = 'vencida'),
    'ticket_promedio', (SELECT round(avg(precio)) FROM montos WHERE estado = 'aceptada'),
    'propuestas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'token', m.token, 'proyecto_id', m.proyecto_id, 'negocio', m.negocio, 'estado', m.estado_real,
        'precio', m.precio, 'plazo_dias', m.plazo_dias, 'adelanto_pct', m.adelanto_pct,
        'monto_adelanto', m.monto_adelanto, 'monto_saldo', m.monto_saldo,
        'creada_en', m.creada_en, 'respondida_en', m.respondida_en,
        'adelanto_cobrado_en', m.adelanto_cobrado_en, 'saldo_cobrado_en', m.saldo_cobrado_en,
        'hitos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', h.id, 'orden', h.orden, 'titulo', h.titulo, 'monto', h.monto, 'estado', h.estado, 'cobrado_en', h.cobrado_en
          ) ORDER BY h.orden)
          FROM hitos h WHERE h.propuesta_id = m.id
        ), '[]'::jsonb)
      ) ORDER BY m.creada_en DESC)
      FROM montos m WHERE m.estado NOT IN ('reemplazada', 'retirada')
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.mis_ingresos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_ingresos() TO authenticated;
