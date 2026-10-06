-- ============================================================================
-- AIB+ — Medición de la portada (modelo marketplace)
-- ============================================================================
-- Para saber si los dueños de negocio llegan solos y qué canal los trae:
--
--   - visitas_portada: cuántas visitas tiene la portada por día y por canal
--     (el ?c= del enlace: instagram, maps…; sin canal, 'directo'). Solo una
--     cuenta: ni cookies, ni IP, ni nada que identifique a nadie.
--   - intereses_cliente: quién pulsó «Prefiero publicarla yo» junto a su
--     maqueta. Mide si hay demanda de un plan para publicar la web uno mismo
--     antes de construirlo.
--   - embudo_portada(): para el ingeniero, por canal: visitas → pulsaron
--     «Pruébalo gratis» → empezaron → vieron su maqueta → aceptaron.
--
-- El canal de cada prueba sin cuenta se guarda en invitaciones.canal
-- (supabase_invitaciones.sql, sección 8). Ejecutar después de
-- supabase_invitaciones.sql y supabase_panel_ingeniero.sql. Se puede ejecutar
-- más de una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.visitas_portada (
  dia     DATE NOT NULL,
  canal   TEXT NOT NULL CHECK (canal ~ '^[a-z0-9_-]{1,30}$'),
  visitas INTEGER NOT NULL DEFAULT 0 CHECK (visitas >= 0),
  PRIMARY KEY (dia, canal)
);

ALTER TABLE public.visitas_portada ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitas_portada FROM anon, authenticated;

-- La llama la portada una vez por visita (la app lo controla por pestaña).
-- Cualquiera puede llamarla sin sesión, así que tiene topes: 5000 visitas por
-- día y canal, y como mucho 30 canales distintos por día (el resto va a
-- 'otro'), para que nadie llene la tabla inventando canales.
CREATE OR REPLACE FUNCTION public.registrar_visita_portada(p_canal TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dia   DATE := (now() AT TIME ZONE 'America/Lima')::date;
  v_canal TEXT := lower(btrim(COALESCE(p_canal, '')));
BEGIN
  -- Las visitas del ingeniero no cuentan.
  IF public.es_ingeniero() THEN
    RETURN;
  END IF;

  IF v_canal !~ '^[a-z0-9_-]{1,30}$' THEN
    v_canal := 'directo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.visitas_portada WHERE dia = v_dia AND canal = v_canal)
     AND (SELECT count(*) FROM public.visitas_portada WHERE dia = v_dia) >= 30 THEN
    v_canal := 'otro';
  END IF;

  INSERT INTO public.visitas_portada AS v (dia, canal, visitas)
  VALUES (v_dia, v_canal, 1)
  ON CONFLICT (dia, canal) DO UPDATE
    SET visitas = v.visitas + 1
    WHERE v.visitas < 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_visita_portada(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_visita_portada(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- «Prefiero publicarla yo»
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intereses_cliente (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('publicar-yo')),
  -- Las pruebas del ingeniero no cuentan.
  es_prueba   BOOLEAN NOT NULL DEFAULT false,
  primera_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
  veces       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, tipo)
);

ALTER TABLE public.intereses_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intereses_cliente FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_interes(p_tipo TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('publicar-yo') THEN
    RETURN;
  END IF;

  INSERT INTO public.intereses_cliente AS i (user_id, tipo, es_prueba)
  VALUES (
    auth.uid(),
    p_tipo,
    public.es_ingeniero()
      OR EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = auth.uid() AND es_prueba)
  )
  ON CONFLICT (user_id, tipo) DO UPDATE SET veces = i.veces + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_interes(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_interes(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Lo que ve el ingeniero
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.embudo_portada()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero ve el embudo de la portada' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'desde', (SELECT min(dia) FROM public.visitas_portada),
    'canales', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'canal', c.canal,
        'visitas', c.visitas,
        'pulsaron', c.pulsaron,
        'empezaron', c.empezaron,
        'maqueta', c.maqueta,
        'aceptaron', c.aceptaron
      ) ORDER BY c.visitas DESC, c.pulsaron DESC, c.canal), '[]'::jsonb)
      FROM (
        SELECT canal,
               COALESCE(sum(visitas), 0)::int AS visitas,
               COALESCE(sum(pulsaron), 0)::int AS pulsaron,
               COALESCE(sum(empezaron), 0)::int AS empezaron,
               COALESCE(sum(maqueta), 0)::int AS maqueta,
               COALESCE(sum(aceptaron), 0)::int AS aceptaron
        FROM (
          SELECT v.canal, v.visitas, 0 AS pulsaron, 0 AS empezaron, 0 AS maqueta, 0 AS aceptaron
          FROM public.visitas_portada v
          UNION ALL
          SELECT COALESCE(i.canal, 'directo'), 0, 1,
                 (r.empezada_en IS NOT NULL)::int,
                 (r.maqueta_en IS NOT NULL)::int,
                 (r.aceptada_en IS NOT NULL)::int
          FROM public.invitaciones i
          JOIN public.invitaciones_resumen r ON r.id = i.id
          WHERE i.origen = 'portada' AND NOT i.es_prueba
        ) x
        GROUP BY canal
      ) c
    ),
    'publicar_yo', jsonb_build_object(
      'quieren', (SELECT count(*) FROM public.intereses_cliente WHERE tipo = 'publicar-yo' AND NOT es_prueba),
      -- 8 = «maqueta» en HITOS (src/lib/embudo.ts).
      'vieron_maqueta', (
        SELECT count(DISTINCT user_id) FROM public.progreso_cuestionario WHERE orden >= 8 AND NOT es_prueba
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.embudo_portada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embudo_portada() TO authenticated;
