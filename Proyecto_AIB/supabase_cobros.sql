-- ============================================================================
-- AIB+ — Cobros y comisión de AIB+
-- ============================================================================
-- AIB+ no mueve dinero: el cliente le paga a su ingeniero como acuerden
-- (Yape, Plin, transferencia…). Aquí se lleva la cuenta:
--
--   1. El ingeniero anota el precio que acordó con el cliente. La comisión de
--      AIB+ se calcula con el porcentaje vigente en ese momento y queda
--      guardada: si luego cambia el porcentaje, ese encargo no cambia.
--   2. Marca cuando el cliente le pagó: desde ahí le debe la comisión a AIB+.
--   3. El administrador marca la comisión como recibida. Ese cobro queda
--      cerrado.
--
-- Los encargos del propio administrador no llevan comisión. Cada ingeniero
-- ve solo sus cobros; el administrador, todos.
--
-- Ejecutar después de supabase_marketplace.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Porcentaje de la comisión
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comision_aib (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  porcentaje     NUMERIC(4,1) NOT NULL DEFAULT 15 CHECK (porcentaje BETWEEN 0 AND 50),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.comision_aib (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.comision_aib ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comision_aib FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.configurar_comision(p_porcentaje NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador cambia la comisión' USING ERRCODE = '42501';
  END IF;
  IF p_porcentaje IS NULL OR p_porcentaje NOT BETWEEN 0 AND 50 THEN
    RAISE EXCEPTION 'La comisión va de 0 a 50' USING ERRCODE = '22023';
  END IF;
  UPDATE public.comision_aib SET porcentaje = round(p_porcentaje, 1), actualizado_en = now() WHERE id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_comision(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_comision(NUMERIC) TO authenticated;

-- El porcentaje vigente, para los ingenieros.
CREATE OR REPLACE FUNCTION public.comision_vigente()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT porcentaje FROM public.comision_aib WHERE id AND public.es_ingeniero();
$$;

REVOKE ALL ON FUNCTION public.comision_vigente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comision_vigente() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Cobros
-- ----------------------------------------------------------------------------
-- Uno por encargo. Si el proyecto se borra, el cobro se queda (con el nombre
-- del negocio copiado) para no perder la cuenta.
CREATE TABLE IF NOT EXISTS public.cobros (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id        UUID UNIQUE REFERENCES public.proyectos(id) ON DELETE SET NULL,
  ingeniero_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  negocio            TEXT,
  precio             INTEGER NOT NULL CHECK (precio BETWEEN 1 AND 1000000),
  porcentaje         NUMERIC(4,1) NOT NULL CHECK (porcentaje BETWEEN 0 AND 50),
  comision           INTEGER NOT NULL CHECK (comision >= 0),
  cliente_pago_en    TIMESTAMPTZ,
  comision_pagada_en TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cobros_ingeniero_idx ON public.cobros (ingeniero_id);

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cobros FROM anon, authenticated;
GRANT SELECT ON public.cobros TO authenticated;

-- Solo lectura: se escribe con las funciones de abajo.
DROP POLICY IF EXISTS "cobros: los suyos o el admin" ON public.cobros;
CREATE POLICY "cobros: los suyos o el admin"
  ON public.cobros FOR SELECT TO authenticated
  USING (public.es_admin() OR ingeniero_id = (SELECT auth.uid()));

-- Con el nombre del ingeniero (perfiles_ingeniero ya deja ver solo el propio
-- o, al administrador, todos).
CREATE OR REPLACE VIEW public.cobros_detalle
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.proyecto_id,
  c.ingeniero_id,
  (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = c.ingeniero_id) AS ingeniero,
  c.negocio,
  c.precio,
  c.porcentaje,
  c.comision,
  c.cliente_pago_en,
  c.comision_pagada_en,
  c.creado_en
FROM public.cobros c;

REVOKE ALL ON public.cobros_detalle FROM anon;
GRANT SELECT ON public.cobros_detalle TO authenticated;

-- El cobro de un encargo y el porcentaje que le toca: el ya guardado, 0 si
-- lo lleva el administrador o el vigente. null si no puede verlo.
CREATE OR REPLACE FUNCTION public.cobro_de_encargo(p_proyecto UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
  v_cobro     public.cobros%ROWTYPE;
BEGIN
  SELECT ingeniero_id INTO v_ingeniero FROM public.proyectos
  WHERE id = p_proyecto AND payload->>'aceptado' = 'true';
  IF v_ingeniero IS NULL OR NOT public.es_ingeniero()
     OR NOT (v_ingeniero = auth.uid() OR public.es_admin()) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE proyecto_id = p_proyecto;

  RETURN jsonb_build_object(
    'porcentaje',
    CASE
      WHEN v_cobro.id IS NOT NULL AND v_cobro.ingeniero_id = v_ingeniero THEN v_cobro.porcentaje
      WHEN public.es_admin_id(v_ingeniero) THEN 0
      ELSE (SELECT porcentaje FROM public.comision_aib WHERE id)
    END,
    'cobro',
    CASE WHEN v_cobro.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_cobro.id,
      'precio', v_cobro.precio,
      'porcentaje', v_cobro.porcentaje,
      'comision', v_cobro.comision,
      'cliente_pago_en', v_cobro.cliente_pago_en,
      'comision_pagada_en', v_cobro.comision_pagada_en
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cobro_de_encargo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cobro_de_encargo(UUID) TO authenticated;

-- El ingeniero del encargo (o el administrador) anota o corrige el precio.
-- Devuelve {estado}: 'ok', 'cerrado' (la comisión ya se pagó) o 'no_existe'.
CREATE OR REPLACE FUNCTION public.registrar_precio_acordado(p_proyecto UUID, p_precio INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero  UUID;
  v_negocio    TEXT;
  v_cobro      public.cobros%ROWTYPE;
  v_porcentaje NUMERIC(4,1);
BEGIN
  SELECT ingeniero_id,
         COALESCE(NULLIF(btrim(payload->'ficha'->>'empresa'), ''), payload->>'servicio')
    INTO v_ingeniero, v_negocio
  FROM public.proyectos
  WHERE id = p_proyecto AND payload->>'aceptado' = 'true';
  IF v_ingeniero IS NULL OR NOT public.es_ingeniero()
     OR NOT (v_ingeniero = auth.uid() OR public.es_admin()) THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  IF p_precio IS NULL OR p_precio NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'Pon un precio en soles, sin decimales' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE proyecto_id = p_proyecto;
  IF v_cobro.comision_pagada_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'cerrado');
  END IF;

  v_porcentaje := CASE
    WHEN public.es_admin_id(v_ingeniero) THEN 0
    WHEN v_cobro.id IS NOT NULL AND v_cobro.ingeniero_id = v_ingeniero THEN v_cobro.porcentaje
    ELSE (SELECT porcentaje FROM public.comision_aib WHERE id)
  END;

  INSERT INTO public.cobros (proyecto_id, ingeniero_id, negocio, precio, porcentaje, comision)
  VALUES (p_proyecto, v_ingeniero, v_negocio, p_precio, v_porcentaje, round(p_precio * v_porcentaje / 100)::INTEGER)
  ON CONFLICT (proyecto_id) DO UPDATE SET
    ingeniero_id   = EXCLUDED.ingeniero_id,
    negocio        = EXCLUDED.negocio,
    precio         = EXCLUDED.precio,
    porcentaje     = EXCLUDED.porcentaje,
    comision       = EXCLUDED.comision,
    actualizado_en = now();

  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_precio_acordado(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_precio_acordado(UUID, INTEGER) TO authenticated;

-- El ingeniero marca (o desmarca) que el cliente ya le pagó. No se toca si la
-- comisión ya se pagó.
CREATE OR REPLACE FUNCTION public.marcar_pago_cliente(p_cobro UUID, p_pagado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() THEN
    RETURN false;
  END IF;
  UPDATE public.cobros
  SET cliente_pago_en = CASE WHEN p_pagado THEN COALESCE(cliente_pago_en, now()) END,
      actualizado_en  = now()
  WHERE id = p_cobro
    AND comision_pagada_en IS NULL
    AND (ingeniero_id = auth.uid() OR public.es_admin());
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_pago_cliente(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_pago_cliente(UUID, BOOLEAN) TO authenticated;

-- El administrador marca (o desmarca) que recibió la comisión. Recibirla
-- implica que el cliente ya pagó.
CREATE OR REPLACE FUNCTION public.marcar_comision_recibida(p_cobro UUID, p_recibida BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador marca las comisiones' USING ERRCODE = '42501';
  END IF;
  UPDATE public.cobros
  SET comision_pagada_en = CASE WHEN p_recibida THEN COALESCE(comision_pagada_en, now()) END,
      cliente_pago_en    = CASE WHEN p_recibida THEN COALESCE(cliente_pago_en, now()) ELSE cliente_pago_en END,
      actualizado_en     = now()
  WHERE id = p_cobro;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_comision_recibida(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_comision_recibida(UUID, BOOLEAN) TO authenticated;
