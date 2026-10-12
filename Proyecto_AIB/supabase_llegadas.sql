-- ============================================================================
-- AIB+ — De dónde llegan las visitas (Google, otros buscadores, redes…)
-- ============================================================================
-- Hasta el 2026-10-12 solo se contaba la portada, por el ?c= del enlace, y
-- quien llegaba desde Google figuraba como 'directo'. Ahora:
--
--   - visitas_portada guarda también la página de entrada ('portada',
--     'servicios/<slug>', 'rubros/<slug>' o 'explorar'): cada pestaña cuenta
--     una vez, en la primera página pública que abre.
--   - El canal sale del ?c= o, si no hay, de la web de la que viene la visita
--     (google, buscador, facebook, instagram, otra-web). Lo decide la app; aquí
--     solo se valida.
--   - invitaciones.entrada: la página por la que entró quien empezó una prueba
--     sin cuenta.
--   - llegadas_admin(p_semanas): para Métricas, por canal y por página de
--     entrada: visitas → pruebas → maqueta → encargo.
--
-- Solo se cuentan totales: ni cookies, ni IP, ni nada que identifique a nadie.
-- Ejecutar después de supabase_medicion_portada.sql y supabase_metricas.sql.
-- Se puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La página de entrada en las visitas
-- ----------------------------------------------------------------------------
ALTER TABLE public.visitas_portada ADD COLUMN IF NOT EXISTS pagina TEXT NOT NULL DEFAULT 'portada';

ALTER TABLE public.visitas_portada DROP CONSTRAINT IF EXISTS visitas_portada_pagina_check;
ALTER TABLE public.visitas_portada ADD CONSTRAINT visitas_portada_pagina_check
  CHECK (pagina ~ '^(portada|explorar|otra|(servicios|rubros)/[a-z0-9-]{1,40})$');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.visitas_portada'::regclass
      AND conname = 'visitas_portada_pkey'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (dia, pagina, canal)'
  ) THEN
    ALTER TABLE public.visitas_portada DROP CONSTRAINT IF EXISTS visitas_portada_pkey;
    ALTER TABLE public.visitas_portada ADD CONSTRAINT visitas_portada_pkey PRIMARY KEY (dia, pagina, canal);
  END IF;
END;
$$;

-- Una visita a una página pública, una vez por pestaña (lo controla la app).
-- Sin sesión, así que con topes: 5000 por día, página y canal, y como mucho
-- 200 combinaciones distintas por día (el resto va a 'otra'/'otro'), para que
-- nadie llene la tabla inventando páginas o canales.
CREATE OR REPLACE FUNCTION public.registrar_visita(p_pagina TEXT, p_canal TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dia    DATE := (now() AT TIME ZONE 'America/Lima')::date;
  v_pagina TEXT := lower(btrim(COALESCE(p_pagina, '')));
  v_canal  TEXT := lower(btrim(COALESCE(p_canal, '')));
BEGIN
  -- Las visitas de los ingenieros no cuentan.
  IF public.es_ingeniero() THEN
    RETURN;
  END IF;

  IF v_pagina !~ '^(portada|explorar|(servicios|rubros)/[a-z0-9-]{1,40})$' THEN
    v_pagina := 'otra';
  END IF;
  IF v_canal !~ '^[a-z0-9_-]{1,30}$' THEN
    v_canal := 'directo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.visitas_portada WHERE dia = v_dia AND pagina = v_pagina AND canal = v_canal)
     AND (SELECT count(*) FROM public.visitas_portada WHERE dia = v_dia) >= 200 THEN
    v_pagina := 'otra';
    v_canal := 'otro';
  END IF;

  INSERT INTO public.visitas_portada AS v (dia, pagina, canal, visitas)
  VALUES (v_dia, v_pagina, v_canal, 1)
  ON CONFLICT (dia, pagina, canal) DO UPDATE
    SET visitas = v.visitas + 1
    WHERE v.visitas < 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_visita(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_visita(TEXT, TEXT) TO anon, authenticated;

-- La de antes, para las pestañas que aún tengan abierta la versión anterior.
CREATE OR REPLACE FUNCTION public.registrar_visita_portada(p_canal TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.registrar_visita('portada', p_canal);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_visita_portada(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_visita_portada(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La página de entrada de cada prueba sin cuenta
-- ----------------------------------------------------------------------------
ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS entrada TEXT;

ALTER TABLE public.invitaciones DROP CONSTRAINT IF EXISTS invitaciones_entrada_check;
ALTER TABLE public.invitaciones ADD CONSTRAINT invitaciones_entrada_check
  CHECK (entrada IS NULL OR entrada ~ '^(portada|explorar|(servicios|rubros)/[a-z0-9-]{1,40})$');

-- Igual que en supabase_invitaciones.sql (sección 8), más p_entrada.
DROP FUNCTION IF EXISTS public.empezar_prueba_libre(TEXT);
CREATE OR REPLACE FUNCTION public.empezar_prueba_libre(p_canal TEXT DEFAULT NULL, p_entrada TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario   UUID := auth.uid();
  v_ingeniero UUID;
  v_canal     TEXT := lower(btrim(COALESCE(p_canal, '')));
  v_entrada   TEXT := lower(btrim(COALESCE(p_entrada, '')));
BEGIN
  IF v_canal !~ '^[a-z0-9_-]{1,30}$' THEN
    v_canal := NULL;
  END IF;
  IF v_entrada !~ '^(portada|explorar|(servicios|rubros)/[a-z0-9-]{1,40})$' THEN
    v_entrada := NULL;
  END IF;

  IF v_usuario IS NULL OR NOT public.es_anonimo() THEN
    RETURN jsonb_build_object('estado', 'no_anonimo');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario) THEN
    RETURN jsonb_build_object('estado', 'ok');
  END IF;

  -- Una a la vez, para que dos clics simultáneos no pasen del máximo diario.
  PERFORM pg_advisory_xact_lock(hashtext('aib-prueba-libre'));
  IF NOT public.hay_cupo_prueba_libre() THEN
    RETURN jsonb_build_object('estado', 'lleno');
  END IF;

  -- Con un solo ingeniero, es suya. Con varios, la del primero (hasta que
  -- haya reparto).
  SELECT user_id INTO v_ingeniero FROM public.perfiles WHERE rol = 'ingeniero' ORDER BY created_at LIMIT 1;

  INSERT INTO public.invitaciones (ingeniero_id, negocio, origen, cliente_id, abierta_en, ultima_visita, canal, entrada)
  VALUES (v_ingeniero, 'Sin nombre todavía', 'portada', v_usuario, now(), now(), v_canal, v_entrada);

  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.empezar_prueba_libre(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empezar_prueba_libre(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Lo que ve el administrador en Métricas
-- ----------------------------------------------------------------------------
-- Mismo periodo que metricas_admin: las últimas p_semanas semanas de lunes a
-- domingo, hora de Lima. Pruebas = pruebas sin cuenta (origen 'portada') de
-- clientes reales que empezaron el cuestionario en el periodo, como «Pruebas»
-- en metricas_admin; maqueta y encargo, de esas mismas pruebas.
CREATE OR REPLACE FUNCTION public.llegadas_admin(p_semanas INTEGER DEFAULT 8)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_semanas INTEGER := LEAST(GREATEST(COALESCE(p_semanas, 8), 1), 26);
  v_hoy     DATE := (now() AT TIME ZONE 'America/Lima')::date;
  v_inicio  DATE;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador ve las métricas' USING ERRCODE = '42501';
  END IF;
  v_inicio := date_trunc('week', v_hoy)::date - (v_semanas - 1) * 7;

  RETURN (
    WITH visitas AS (
      SELECT pagina, canal, sum(visitas)::int AS visitas
      FROM public.visitas_portada
      WHERE dia >= v_inicio
      GROUP BY pagina, canal
    ),
    pruebas AS (
      SELECT COALESCE(i.canal, 'directo') AS canal,
             COALESCE(i.entrada, 'sin-dato') AS pagina,
             (r.maqueta_en IS NOT NULL) AS maqueta,
             (r.aceptada_en IS NOT NULL) AS encargo
      FROM public.invitaciones i
      JOIN public.invitaciones_resumen r ON r.id = i.id
      WHERE i.origen = 'portada'
        AND NOT i.es_prueba
        AND (i.empezada_en AT TIME ZONE 'America/Lima')::date >= v_inicio
    )
    SELECT jsonb_build_object(
      'canales', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'canal', c.canal, 'visitas', c.visitas, 'pruebas', c.pruebas, 'maqueta', c.maqueta, 'encargos', c.encargos
        ) ORDER BY c.visitas DESC, c.pruebas DESC, c.canal), '[]'::jsonb)
        FROM (
          SELECT canal,
                 sum(visitas)::int AS visitas,
                 sum(pruebas)::int AS pruebas,
                 sum(maqueta)::int AS maqueta,
                 sum(encargos)::int AS encargos
          FROM (
            SELECT canal, visitas, 0 AS pruebas, 0 AS maqueta, 0 AS encargos FROM visitas
            UNION ALL
            SELECT canal, 0, 1, maqueta::int, encargo::int FROM pruebas
          ) x
          GROUP BY canal
        ) c
      ),
      'paginas', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'pagina', p.pagina, 'visitas', p.visitas, 'google', p.google, 'pruebas', p.pruebas, 'encargos', p.encargos
        ) ORDER BY p.visitas DESC, p.pruebas DESC, p.pagina), '[]'::jsonb)
        FROM (
          SELECT pagina,
                 sum(visitas)::int AS visitas,
                 sum(google)::int AS google,
                 sum(pruebas)::int AS pruebas,
                 sum(encargos)::int AS encargos
          FROM (
            SELECT pagina, visitas, CASE WHEN canal = 'google' THEN visitas ELSE 0 END AS google, 0 AS pruebas, 0 AS encargos
            FROM visitas
            UNION ALL
            SELECT pagina, 0, 0, 1, encargo::int FROM pruebas
          ) x
          GROUP BY pagina
          ORDER BY sum(visitas) DESC, sum(pruebas) DESC
          LIMIT 30
        ) p
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.llegadas_admin(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.llegadas_admin(INTEGER) TO authenticated;
