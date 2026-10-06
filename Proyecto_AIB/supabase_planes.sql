-- ============================================================================
-- AIB+ — Planes de suscripción (Free, Pro, Negocio) y equipos
-- ============================================================================
-- Los ingenieros pagan una suscripción por usar la plataforma; los clientes
-- siguen gratis. Sustituye a la comisión por encargo (supabase_cobros.sql),
-- que se quita aquí.
--
--   Free     Todo menos ABI, el asistente con IA.
--   Pro      Todo, con ABI.
--   Negocio  Todo, con ABI, y un equipo de hasta 5 personas (el dueño y 4
--            más): todos ven los encargos del dueño y él reparte quién lleva
--            cada uno.
--
-- El pago, por ahora, es manual: el ingeniero pide un plan, paga por Yape al
-- administrador y el administrador lo activa por 30 días desde su panel. Los
-- precios y el Yape los pone el administrador (no van en el código).
-- El administrador tiene todo sin pagar.
--
-- Ejecutar después de supabase_marketplace.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Fuera la comisión por encargo (no se llegó a usar)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.cobros_detalle;
DROP FUNCTION IF EXISTS public.cobro_de_encargo(UUID);
DROP FUNCTION IF EXISTS public.registrar_precio_acordado(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.marcar_pago_cliente(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.marcar_comision_recibida(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.configurar_comision(NUMERIC);
DROP FUNCTION IF EXISTS public.comision_vigente();
DROP TABLE IF EXISTS public.cobros;
DROP TABLE IF EXISTS public.comision_aib;

-- ----------------------------------------------------------------------------
-- 1. Tablas
-- ----------------------------------------------------------------------------
-- Una sola fila: precios en soles y a dónde se paga.
CREATE TABLE IF NOT EXISTS public.config_planes (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  precio_pro     INTEGER NOT NULL DEFAULT 39 CHECK (precio_pro BETWEEN 1 AND 10000),
  precio_negocio INTEGER NOT NULL DEFAULT 119 CHECK (precio_negocio BETWEEN 1 AND 10000),
  yape_numero    TEXT CHECK (yape_numero ~ '^9[0-9]{8}$'),
  yape_titular   TEXT CHECK (char_length(yape_titular) <= 80),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.config_planes (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- El plan pagado de cada ingeniero. Vencido, vuelve a Free.
CREATE TABLE IF NOT EXISTS public.suscripciones (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan           TEXT NOT NULL CHECK (plan IN ('pro', 'negocio')),
  vence_en       TIMESTAMPTZ NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un pedido pendiente por ingeniero, hasta que el administrador lo atiende.
CREATE TABLE IF NOT EXISTS public.pedidos_plan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL CHECK (plan IN ('pro', 'negocio')),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_en TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_plan_pendiente_idx ON public.pedidos_plan (user_id) WHERE atendido_en IS NULL;

-- Cada activación, para saber cuánto entró. Se queda aunque se borre la cuenta.
CREATE TABLE IF NOT EXISTS public.pagos_plan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan          TEXT NOT NULL CHECK (plan IN ('pro', 'negocio')),
  meses         INTEGER NOT NULL CHECK (meses BETWEEN 1 AND 12),
  monto         INTEGER NOT NULL CHECK (monto >= 0),
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El equipo de un dueño con plan Negocio y su enlace para unirse.
CREATE TABLE IF NOT EXISTS public.equipos (
  dueno_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token     TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada persona está en un solo equipo.
CREATE TABLE IF NOT EXISTS public.miembros_equipo (
  miembro_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dueno_id   UUID NOT NULL REFERENCES public.equipos(dueno_id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 60),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS miembros_equipo_dueno_idx ON public.miembros_equipo (dueno_id);

-- Nada se lee ni se escribe directo: todo pasa por las funciones de abajo.
ALTER TABLE public.config_planes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suscripciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_plan    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_plan      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.miembros_equipo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_planes, public.suscripciones, public.pedidos_plan, public.pagos_plan,
  public.equipos, public.miembros_equipo FROM anon, authenticated;

-- Quién lleva cada encargo dentro de un equipo (el ingeniero elegido sigue
-- siendo el dueño: a él le llegan el cliente y la reseña).
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 2. ¿Qué plan tiene?
-- ----------------------------------------------------------------------------
-- El suyo: 'admin', el que pagó y sigue vigente, o 'free'.
CREATE OR REPLACE FUNCTION public.plan_propio(p_usuario UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.es_admin_id(p_usuario) THEN 'admin'
    ELSE COALESCE(
      (SELECT s.plan FROM public.suscripciones s WHERE s.user_id = p_usuario AND s.vence_en > now()),
      'free'
    )
  END;
$$;

-- Un equipo funciona mientras su dueño tenga Negocio (o sea el administrador).
CREATE OR REPLACE FUNCTION public.equipo_activo(p_dueno UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.plan_propio(p_dueno) IN ('negocio', 'admin');
$$;

-- El que vale: el suyo o, si es Free y está en un equipo activo, Negocio.
CREATE OR REPLACE FUNCTION public.plan_de(p_usuario UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.plan_propio(p_usuario) <> 'free' THEN public.plan_propio(p_usuario)
    WHEN EXISTS (
      SELECT 1 FROM public.miembros_equipo m
      WHERE m.miembro_id = p_usuario AND public.equipo_activo(m.dueno_id)
    ) THEN 'negocio'
    ELSE 'free'
  END;
$$;

-- Para las políticas: el dueño del equipo (activo) de quien consulta.
CREATE OR REPLACE FUNCTION public.dueno_de_mi_equipo()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.dueno_id FROM public.miembros_equipo m
  WHERE m.miembro_id = auth.uid() AND public.equipo_activo(m.dueno_id);
$$;

REVOKE ALL ON FUNCTION public.plan_propio(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equipo_activo(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_de(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dueno_de_mi_equipo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dueno_de_mi_equipo() TO authenticated;

-- ¿Puede usar ABI? Lo consulta el servidor antes de cada pregunta.
CREATE OR REPLACE FUNCTION public.tengo_abi()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.es_ingeniero() AND public.plan_de(auth.uid()) <> 'free';
$$;

REVOKE ALL ON FUNCTION public.tengo_abi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tengo_abi() TO authenticated;

-- Los precios, para la página de ingenieros (sin sesión).
CREATE OR REPLACE FUNCTION public.precios_planes()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('pro', precio_pro, 'negocio', precio_negocio) FROM public.config_planes WHERE id;
$$;

REVOKE ALL ON FUNCTION public.precios_planes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precios_planes() TO anon, authenticated;

-- Todo lo que necesita la pestaña «Mi plan». null si no es ingeniero.
CREATE OR REPLACE FUNCTION public.mi_plan()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_yo     UUID := auth.uid();
  v_config public.config_planes%ROWTYPE;
  v_sub    public.suscripciones%ROWTYPE;
  v_pedido public.pedidos_plan%ROWTYPE;
BEGIN
  IF NOT public.es_ingeniero() THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_config FROM public.config_planes WHERE id;
  SELECT * INTO v_sub FROM public.suscripciones WHERE user_id = v_yo;
  SELECT * INTO v_pedido FROM public.pedidos_plan WHERE user_id = v_yo AND atendido_en IS NULL;

  RETURN jsonb_build_object(
    'plan', public.plan_de(v_yo),
    'nombre', COALESCE(
      (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = v_yo),
      (SELECT m.nombre FROM public.miembros_equipo m WHERE m.miembro_id = v_yo),
      (SELECT split_part(u.email, '@', 1) FROM auth.users u WHERE u.id = v_yo)
    ),
    'propio', CASE WHEN v_sub.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'plan', v_sub.plan, 'vence_en', v_sub.vence_en, 'vigente', v_sub.vence_en > now()
    ) END,
    'por_equipo', public.plan_propio(v_yo) = 'free' AND public.dueno_de_mi_equipo() IS NOT NULL,
    'pedido', CASE WHEN v_pedido.id IS NULL THEN NULL ELSE jsonb_build_object(
      'plan', v_pedido.plan, 'creado_en', v_pedido.creado_en
    ) END,
    'precios', jsonb_build_object('pro', v_config.precio_pro, 'negocio', v_config.precio_negocio),
    -- A dónde pagar: solo a quien tiene un pedido pendiente.
    'yape', CASE WHEN v_config.yape_numero IS NULL OR v_pedido.id IS NULL THEN NULL ELSE jsonb_build_object(
      'numero', v_config.yape_numero, 'titular', v_config.yape_titular
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mi_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_plan() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Pedir un plan (el ingeniero)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedir_plan(p_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() OR public.es_admin() THEN
    RETURN false;
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('pro', 'negocio') THEN
    RAISE EXCEPTION 'Plan no válido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pedidos_plan (user_id, plan) VALUES (auth.uid(), p_plan)
  ON CONFLICT (user_id) WHERE atendido_en IS NULL
  DO UPDATE SET plan = EXCLUDED.plan, creado_en = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_pedido_plan()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.pedidos_plan WHERE user_id = auth.uid() AND atendido_en IS NULL RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.pedir_plan(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_pedido_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedir_plan(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_pedido_plan() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Administrar los planes (el administrador)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configurar_planes(
  p_precio_pro INTEGER,
  p_precio_negocio INTEGER,
  p_yape_numero TEXT,
  p_yape_titular TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador cambia los planes' USING ERRCODE = '42501';
  END IF;
  UPDATE public.config_planes SET
    precio_pro     = p_precio_pro,
    precio_negocio = p_precio_negocio,
    yape_numero    = NULLIF(regexp_replace(COALESCE(p_yape_numero, ''), '[^0-9]', '', 'g'), ''),
    yape_titular   = NULLIF(btrim(COALESCE(p_yape_titular, '')), ''),
    actualizado_en = now()
  WHERE id;
  RETURN true;
END;
$$;

-- Activa o renueva un plan. Si ya tenía ese mismo plan vigente, los días se
-- suman al final; si no, cuentan desde hoy. p_cortesia: sin pago (un regalo).
CREATE OR REPLACE FUNCTION public.activar_plan(p_usuario UUID, p_plan TEXT, p_meses INTEGER, p_cortesia BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub    public.suscripciones%ROWTYPE;
  v_config public.config_planes%ROWTYPE;
  v_desde  TIMESTAMPTZ;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador activa planes' USING ERRCODE = '42501';
  END IF;
  IF p_plan IS NULL OR p_plan NOT IN ('pro', 'negocio') OR p_meses IS NULL OR p_meses NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Plan o meses no válidos' USING ERRCODE = '22023';
  END IF;
  IF NOT public.es_ingeniero_id(p_usuario) OR public.es_admin_id(p_usuario) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_config FROM public.config_planes WHERE id;
  SELECT * INTO v_sub FROM public.suscripciones WHERE user_id = p_usuario FOR UPDATE;
  v_desde := CASE WHEN v_sub.plan = p_plan AND v_sub.vence_en > now() THEN v_sub.vence_en ELSE now() END;

  INSERT INTO public.suscripciones (user_id, plan, vence_en)
  VALUES (p_usuario, p_plan, v_desde + make_interval(days => 30 * p_meses))
  ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, vence_en = EXCLUDED.vence_en, actualizado_en = now();

  INSERT INTO public.pagos_plan (user_id, plan, meses, monto)
  VALUES (
    p_usuario, p_plan, p_meses,
    CASE WHEN COALESCE(p_cortesia, false) THEN 0
         ELSE p_meses * CASE p_plan WHEN 'pro' THEN v_config.precio_pro ELSE v_config.precio_negocio END END
  );

  UPDATE public.pedidos_plan SET atendido_en = now() WHERE user_id = p_usuario AND atendido_en IS NULL;
  RETURN true;
END;
$$;

-- Lo deja en Free desde ya (por ejemplo, si el pago no llegó).
CREATE OR REPLACE FUNCTION public.quitar_plan(p_usuario UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador quita planes' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.suscripciones WHERE user_id = p_usuario;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.descartar_pedido_plan(p_usuario UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador atiende pedidos' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pedidos_plan SET atendido_en = now() WHERE user_id = p_usuario AND atendido_en IS NULL;
  RETURN FOUND;
END;
$$;

-- Precios, Yape, ingresos y cada ingeniero con su plan y su pedido.
CREATE OR REPLACE FUNCTION public.planes_para_admin()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_config  public.config_planes%ROWTYPE;
  v_mes     TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_config FROM public.config_planes WHERE id;

  RETURN jsonb_build_object(
    'config', jsonb_build_object(
      'precio_pro', v_config.precio_pro,
      'precio_negocio', v_config.precio_negocio,
      'yape_numero', v_config.yape_numero,
      'yape_titular', v_config.yape_titular
    ),
    'ingresos', jsonb_build_object(
      'cobrado_mes', COALESCE((SELECT sum(monto) FROM public.pagos_plan WHERE registrado_en >= v_mes), 0),
      'mensual', COALESCE((
        SELECT sum(CASE s.plan WHEN 'pro' THEN v_config.precio_pro ELSE v_config.precio_negocio END)
        FROM public.suscripciones s WHERE s.vence_en > now()
      ), 0),
      'pro', (SELECT count(*) FROM public.suscripciones s WHERE s.plan = 'pro' AND s.vence_en > now()),
      'negocio', (SELECT count(*) FROM public.suscripciones s WHERE s.plan = 'negocio' AND s.vence_en > now())
    ),
    'ingenieros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pf.user_id,
        'nombre', COALESCE(pi.nombre, me.nombre, split_part(u.email, '@', 1)),
        'correo', u.email,
        'plan', public.plan_de(pf.user_id),
        'propio', s.plan,
        'vence_en', s.vence_en,
        'equipo_de', CASE WHEN me.dueno_id IS NULL THEN NULL ELSE COALESCE(
          (SELECT pi2.nombre FROM public.perfiles_ingeniero pi2 WHERE pi2.user_id = me.dueno_id), 'otro ingeniero'
        ) END,
        'miembros', (SELECT count(*) FROM public.miembros_equipo m2 WHERE m2.dueno_id = pf.user_id),
        'pedido', CASE WHEN pp.id IS NULL THEN NULL ELSE jsonb_build_object('plan', pp.plan, 'creado_en', pp.creado_en) END
      ) ORDER BY (pp.id IS NULL), s.vence_en NULLS LAST, pf.created_at)
      FROM public.perfiles pf
      JOIN auth.users u ON u.id = pf.user_id
      LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = pf.user_id
      LEFT JOIN public.miembros_equipo me ON me.miembro_id = pf.user_id
      LEFT JOIN public.suscripciones s ON s.user_id = pf.user_id
      LEFT JOIN public.pedidos_plan pp ON pp.user_id = pf.user_id AND pp.atendido_en IS NULL
      WHERE pf.rol = 'ingeniero' AND NOT pf.es_admin
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_planes(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activar_plan(UUID, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quitar_plan(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.descartar_pedido_plan(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.planes_para_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_planes(INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_plan(UUID, TEXT, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quitar_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.descartar_pedido_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planes_para_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Equipos (plan Negocio)
-- ----------------------------------------------------------------------------
-- Hasta 5 personas: el dueño y 4 miembros.

-- Mi equipo, como dueño o como miembro. null si no estoy en ninguno.
CREATE OR REPLACE FUNCTION public.mi_equipo()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dueno     UUID;
  v_soy_dueno BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipos WHERE dueno_id = auth.uid()) THEN
    v_dueno := auth.uid();
    v_soy_dueno := true;
  ELSE
    SELECT dueno_id INTO v_dueno FROM public.miembros_equipo WHERE miembro_id = auth.uid();
  END IF;
  IF v_dueno IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'rol', CASE WHEN v_soy_dueno THEN 'dueno' ELSE 'miembro' END,
    'dueno_id', v_dueno,
    'agencia', (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = v_dueno),
    'activo', public.equipo_activo(v_dueno),
    'token', CASE WHEN v_soy_dueno THEN (SELECT e.token FROM public.equipos e WHERE e.dueno_id = v_dueno) END,
    'miembros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.miembro_id, 'nombre', m.nombre, 'desde', m.creado_en) ORDER BY m.creado_en)
      FROM public.miembros_equipo m WHERE m.dueno_id = v_dueno
    ), '[]'::jsonb)
  );
END;
$$;

-- El dueño con Negocio arma su equipo; devuelve el token del enlace.
CREATE OR REPLACE FUNCTION public.crear_equipo()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF NOT public.es_ingeniero() OR NOT public.equipo_activo(auth.uid()) THEN
    RAISE EXCEPTION 'El equipo viene con el plan Negocio' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.miembros_equipo WHERE miembro_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ya eres parte de otro equipo' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.equipos (dueno_id) VALUES (auth.uid()) ON CONFLICT (dueno_id) DO NOTHING;
  SELECT token INTO v_token FROM public.equipos WHERE dueno_id = auth.uid();
  RETURN v_token;
END;
$$;

-- Enlace nuevo: el anterior deja de servir.
CREATE OR REPLACE FUNCTION public.renovar_enlace_equipo()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.equipos SET token = replace(gen_random_uuid()::text, '-', '')
  WHERE dueno_id = auth.uid()
  RETURNING token;
$$;

-- Para la página del enlace (puede abrirse sin sesión). null si no existe.
CREATE OR REPLACE FUNCTION public.equipo_por_token(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'agencia', COALESCE((SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = e.dueno_id), 'un equipo de AIB+'),
    'activo', public.equipo_activo(e.dueno_id),
    'lleno', (SELECT count(*) FROM public.miembros_equipo m WHERE m.dueno_id = e.dueno_id) >= 4
  )
  FROM public.equipos e
  WHERE p_token ~ '^[0-9a-f]{32}$' AND e.token = p_token;
$$;

-- Unirse con el enlace. Quien se une pasa a ser ingeniero (sin salir en la
-- lista de la portada: allí sale el dueño). Devuelve {estado}: 'ok',
-- 'no_existe', 'inactivo', 'lleno', 'anonimo', 'ya_en_equipo' o 'tiene_equipo'.
CREATE OR REPLACE FUNCTION public.unirse_equipo(p_token TEXT, p_nombre TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dueno UUID;
  v_actual UUID;
BEGIN
  IF auth.uid() IS NULL OR public.es_anonimo() THEN
    RETURN jsonb_build_object('estado', 'anonimo');
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  -- Bloquea el equipo: dos que se unen a la vez no pasan del cupo.
  SELECT dueno_id INTO v_dueno FROM public.equipos WHERE token = p_token FOR UPDATE;
  IF v_dueno IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT dueno_id INTO v_actual FROM public.miembros_equipo WHERE miembro_id = auth.uid();
  IF v_actual = v_dueno THEN
    RETURN jsonb_build_object('estado', 'ok');
  ELSIF v_actual IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'ya_en_equipo');
  END IF;
  IF v_dueno = auth.uid() OR public.es_admin() OR EXISTS (SELECT 1 FROM public.equipos WHERE dueno_id = auth.uid()) THEN
    RETURN jsonb_build_object('estado', 'tiene_equipo');
  END IF;
  IF NOT public.equipo_activo(v_dueno) THEN
    RETURN jsonb_build_object('estado', 'inactivo');
  END IF;
  IF (SELECT count(*) FROM public.miembros_equipo WHERE dueno_id = v_dueno) >= 4 THEN
    RETURN jsonb_build_object('estado', 'lleno');
  END IF;
  IF p_nombre IS NULL OR char_length(btrim(p_nombre)) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'Escribe tu nombre' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.miembros_equipo (miembro_id, dueno_id, nombre) VALUES (auth.uid(), v_dueno, btrim(p_nombre));
  INSERT INTO public.perfiles (user_id, rol) VALUES (auth.uid(), 'ingeniero')
  ON CONFLICT (user_id) DO UPDATE SET rol = 'ingeniero';
  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

-- Saca a alguien del equipo: sus encargos vuelven al dueño y, si solo era
-- ingeniero por el equipo, vuelve a ser cliente.
CREATE OR REPLACE FUNCTION public.sacar_del_equipo(p_dueno UUID, p_miembro UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.miembros_equipo WHERE miembro_id = p_miembro AND dueno_id = p_dueno;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM set_config('aib.asignando', 'si', true);
  UPDATE public.proyectos SET responsable_id = NULL WHERE ingeniero_id = p_dueno AND responsable_id = p_miembro;
  PERFORM set_config('aib.asignando', '', true);

  UPDATE public.perfiles SET rol = 'cliente'
  WHERE user_id = p_miembro
    AND NOT es_admin
    AND NOT EXISTS (SELECT 1 FROM public.perfiles_ingeniero pi WHERE pi.user_id = p_miembro)
    AND NOT EXISTS (SELECT 1 FROM public.suscripciones s WHERE s.user_id = p_miembro AND s.vence_en > now());
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sacar_del_equipo(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- El dueño quita a un miembro.
CREATE OR REPLACE FUNCTION public.quitar_miembro(p_miembro UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.sacar_del_equipo(auth.uid(), p_miembro);
$$;

-- El miembro se va del equipo.
CREATE OR REPLACE FUNCTION public.salir_del_equipo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT public.sacar_del_equipo(m.dueno_id, m.miembro_id) FROM public.miembros_equipo m WHERE m.miembro_id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.mi_equipo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crear_equipo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.renovar_enlace_equipo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.equipo_por_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unirse_equipo(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quitar_miembro(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salir_del_equipo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_equipo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_equipo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.renovar_enlace_equipo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipo_por_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_equipo(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quitar_miembro(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salir_del_equipo() TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Quién lleva cada encargo dentro del equipo
-- ----------------------------------------------------------------------------
-- Como ingeniero_id: solo se cambia con asignar_responsable. Si el encargo
-- pasa a otro ingeniero, se queda sin responsable.
CREATE OR REPLACE FUNCTION public.proteger_responsable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('aib.asignando', true), '') <> 'si' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.responsable_id := NULL;
    ELSIF NEW.responsable_id IS DISTINCT FROM OLD.responsable_id THEN
      RAISE EXCEPTION 'El responsable de un encargo no se cambia así' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.ingeniero_id IS DISTINCT FROM OLD.ingeniero_id THEN
    NEW.responsable_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_responsable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS proteger_responsable ON public.proyectos;
CREATE TRIGGER proteger_responsable
  BEFORE INSERT OR UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_responsable();

-- El dueño del encargo lo reparte: a un miembro de su equipo, a sí mismo o
-- a nadie (null).
CREATE OR REPLACE FUNCTION public.asignar_responsable(p_proyecto UUID, p_responsable UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proyectos
    WHERE id = p_proyecto AND ingeniero_id = auth.uid() AND payload->>'aceptado' = 'true'
  ) THEN
    RETURN false;
  END IF;
  IF p_responsable IS NOT NULL AND p_responsable <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.miembros_equipo WHERE miembro_id = p_responsable AND dueno_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  PERFORM set_config('aib.asignando', 'si', true);
  UPDATE public.proyectos SET responsable_id = p_responsable WHERE id = p_proyecto;
  PERFORM set_config('aib.asignando', '', true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_responsable(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_responsable(UUID, UUID) TO authenticated;

-- El nombre de un compañero de equipo (o el propio). null para los demás.
CREATE OR REPLACE FUNCTION public.nombre_de_companero(p_usuario UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_usuario IS NULL THEN NULL
    WHEN p_usuario = auth.uid()
      OR public.es_admin()
      OR p_usuario = public.dueno_de_mi_equipo()
      OR EXISTS (
        SELECT 1 FROM public.miembros_equipo m
        WHERE m.miembro_id = p_usuario AND (m.dueno_id = auth.uid() OR m.dueno_id = public.dueno_de_mi_equipo())
      )
    THEN COALESCE(
      (SELECT m.nombre FROM public.miembros_equipo m WHERE m.miembro_id = p_usuario),
      (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = p_usuario)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.nombre_de_companero(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nombre_de_companero(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. El equipo ve los encargos del dueño
-- ----------------------------------------------------------------------------
-- Las mismas políticas de supabase_marketplace.sql, con el equipo. Los
-- comentarios no cambian: ya se apoyan en lo que se ve de proyectos.
DROP POLICY IF EXISTS "El ingeniero ve los proyectos de sus clientes" ON public.proyectos;
CREATE POLICY "El ingeniero ve los proyectos de sus clientes"
  ON public.proyectos FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_ingeniero()
      AND (
        ingeniero_id = (SELECT auth.uid())
        OR ingeniero_id = (SELECT public.dueno_de_mi_equipo())
        OR EXISTS (
          SELECT 1 FROM public.invitaciones i
          WHERE i.cliente_id = proyectos.user_id AND i.ingeniero_id = (SELECT auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "seguimiento: lo ven el dueño y el ingeniero" ON public.seguimiento_encargos;
CREATE POLICY "seguimiento: lo ven el dueño y el ingeniero"
  ON public.seguimiento_encargos FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR EXISTS (
      SELECT 1 FROM public.proyectos p
      WHERE p.id = proyecto_id
        AND (
          p.user_id = (SELECT auth.uid())
          OR p.ingeniero_id = (SELECT auth.uid())
          OR p.ingeniero_id = (SELECT public.dueno_de_mi_equipo())
        )
    )
  );

DROP POLICY IF EXISTS "seguimiento: el ingeniero añade etapas" ON public.seguimiento_encargos;
CREATE POLICY "seguimiento: el ingeniero añade etapas"
  ON public.seguimiento_encargos FOR INSERT TO authenticated
  WITH CHECK (
    public.es_ingeniero()
    AND autor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.proyectos p
      WHERE p.id = proyecto_id
        AND p.payload->>'aceptado' = 'true'
        AND (
          p.ingeniero_id = (SELECT auth.uid())
          OR p.ingeniero_id = (SELECT public.dueno_de_mi_equipo())
          OR public.es_admin()
        )
    )
  );

-- La vista de encargos, con quién lo lleva dentro del equipo (dos columnas
-- más al final).
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
  (
    public.es_ingeniero_id(p.user_id)
    OR EXISTS (SELECT 1 FROM public.invitaciones i WHERE i.cliente_id = p.user_id AND i.es_prueba)
  ) AS es_prueba,
  p.ingeniero_id,
  (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = p.ingeniero_id) AS ingeniero,
  p.responsable_id,
  public.nombre_de_companero(p.responsable_id) AS responsable
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
