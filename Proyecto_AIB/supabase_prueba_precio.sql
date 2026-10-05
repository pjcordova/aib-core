-- ============================================================================
-- AIB+ — Prueba de precio
-- ============================================================================
-- Experimento de validación: cuánto está dispuesto a pagar el dueño de un
-- negocio. El ingeniero pone 2 o 3 precios ("desde S/ X") y cada cliente ve
-- uno solo, siempre el mismo, junto al botón «¡Me gusta, sigamos!». Después
-- se compara cuántos aceptan con cada precio.
--
--   - prueba_precio: una sola fila con la configuración. Solo la toca el
--     ingeniero y el cliente nunca la lee: no puede ver los otros precios.
--   - precio_asignado: el precio que le tocó a cada cliente. Se reparte para
--     que cada precio tenga el mismo número de clientes reales.
--   - mi_precio(): el precio de quien llama (lo asigna la primera vez).
--   - embudo_precios(): los resultados, para el ingeniero.
--
-- Cambiar los precios empieza una ronda nueva: los clientes que ya vieron uno
-- lo siguen viendo, pero los resultados cuentan solo la ronda actual.
--
-- Ejecutar después de supabase_panel_ingeniero.sql. Se puede ejecutar más de
-- una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prueba_precio (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  activa         BOOLEAN NOT NULL DEFAULT false,
  precios        INTEGER[] NOT NULL DEFAULT '{}'
                 CHECK (cardinality(precios) <= 3 AND 0 < ALL (precios) AND 1000000 > ALL (precios)),
  ronda          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.prueba_precio (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.prueba_precio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prueba_precio FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.precio_asignado (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  precio      INTEGER NOT NULL CHECK (precio > 0),
  ronda       TIMESTAMPTZ NOT NULL,
  -- Las pruebas del ingeniero no cuentan en los resultados.
  es_prueba   BOOLEAN NOT NULL DEFAULT false,
  asignado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS precio_asignado_ronda_idx ON public.precio_asignado (ronda, precio);

ALTER TABLE public.precio_asignado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.precio_asignado FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- El precio de quien llama
-- ----------------------------------------------------------------------------
-- NULL si no hay prueba activa. La primera vez se le asigna el precio con
-- menos clientes reales en la ronda (si empatan, uno al azar) y desde ahí
-- siempre ve ese, aunque vuelva otro día.
CREATE OR REPLACE FUNCTION public.mi_precio()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_prueba  public.prueba_precio%ROWTYPE;
  v_precio  INTEGER;
  v_es_prueba BOOLEAN;
BEGIN
  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_prueba FROM public.prueba_precio WHERE id;
  IF NOT FOUND OR NOT v_prueba.activa OR cardinality(v_prueba.precios) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT precio INTO v_precio FROM public.precio_asignado WHERE user_id = v_usuario;
  IF FOUND THEN
    RETURN v_precio;
  END IF;

  v_es_prueba := public.es_ingeniero()
    OR EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario AND es_prueba);

  SELECT p INTO v_precio
  FROM unnest(v_prueba.precios) AS p
  ORDER BY (
    SELECT count(*) FROM public.precio_asignado a
    WHERE a.ronda = v_prueba.ronda AND a.precio = p AND NOT a.es_prueba
  ), random()
  LIMIT 1;

  INSERT INTO public.precio_asignado (user_id, precio, ronda, es_prueba)
  VALUES (v_usuario, v_precio, v_prueba.ronda, v_es_prueba)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT precio INTO v_precio FROM public.precio_asignado WHERE user_id = v_usuario;
  RETURN v_precio;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_precio() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_precio() TO authenticated;

-- ----------------------------------------------------------------------------
-- El ingeniero configura la prueba
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configurar_prueba_precio(p_activa BOOLEAN, p_precios INTEGER[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_precios INTEGER[];
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero configura la prueba de precio' USING ERRCODE = '42501';
  END IF;

  -- Sin repetidos y de menor a mayor: así se leen mejor los resultados.
  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}') INTO v_precios
  FROM unnest(COALESCE(p_precios, '{}')) AS p WHERE p IS NOT NULL;

  IF cardinality(v_precios) > 3 OR EXISTS (SELECT 1 FROM unnest(v_precios) p WHERE p <= 0 OR p >= 1000000) THEN
    RAISE EXCEPTION 'Pon entre 2 y 3 precios en soles' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_activa, false) AND cardinality(v_precios) < 2 THEN
    RAISE EXCEPTION 'Para comparar hacen falta al menos 2 precios' USING ERRCODE = '22023';
  END IF;

  UPDATE public.prueba_precio
  SET activa = COALESCE(p_activa, false),
      ronda = CASE WHEN precios IS DISTINCT FROM v_precios THEN now() ELSE ronda END,
      precios = v_precios,
      actualizado_en = now()
  WHERE id;
END;
$$;

REVOKE ALL ON FUNCTION public.configurar_prueba_precio(BOOLEAN, INTEGER[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configurar_prueba_precio(BOOLEAN, INTEGER[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Resultados de la ronda actual
-- ----------------------------------------------------------------------------
-- Por cada precio: cuántos clientes reales lo vieron, cuántos pulsaron
-- «¡Me gusta, sigamos!» y cuántos aceptaron después de verlo.
CREATE OR REPLACE FUNCTION public.embudo_precios()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prueba public.prueba_precio%ROWTYPE;
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero ve la prueba de precio' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prueba FROM public.prueba_precio WHERE id;

  RETURN jsonb_build_object(
    'activa', COALESCE(v_prueba.activa, false),
    'precios', to_jsonb(COALESCE(v_prueba.precios, '{}')),
    'ronda', v_prueba.ronda,
    'resultados', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'precio', r.precio, 'vieron', r.vieron, 'quisieron', r.quisieron, 'aceptaron', r.aceptaron
      ) ORDER BY r.precio), '[]'::jsonb)
      FROM (
        SELECT p.precio,
               count(a.user_id) AS vieron,
               count(a.user_id) FILTER (WHERE a.quiso OR a.acepto) AS quisieron,
               count(a.user_id) FILTER (WHERE a.acepto) AS aceptaron
        FROM unnest(COALESCE(v_prueba.precios, '{}')) AS p(precio)
        LEFT JOIN LATERAL (
          SELECT pa.user_id,
                 EXISTS (
                   -- 9 = «quiso-aceptar» en HITOS (src/lib/embudo.ts).
                   SELECT 1 FROM public.progreso_cuestionario pc
                   WHERE pc.user_id = pa.user_id AND pc.orden >= 9 AND pc.actualizado_en >= pa.asignado_en
                 ) AS quiso,
                 EXISTS (
                   SELECT 1 FROM public.proyectos pr
                   WHERE pr.user_id = pa.user_id
                     AND pr.payload->>'aceptado' = 'true'
                     AND COALESCE((pr.payload->>'aceptado_en')::timestamptz, pr.updated_at) >= pa.asignado_en
                 ) AS acepto
          FROM public.precio_asignado pa
          WHERE pa.ronda = v_prueba.ronda AND pa.precio = p.precio AND NOT pa.es_prueba
        ) a ON true
        GROUP BY p.precio
      ) r
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.embudo_precios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embudo_precios() TO authenticated;
