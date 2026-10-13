-- ============================================================================
-- AIB+ — Que valga la pena pagar el plan Pro
-- ============================================================================
-- Desde el 2026-10-12, además de aparecer primero (supabase_destacados.sql) y
-- de ABI, Pro y Negocio traen:
--
--   1. Prueba gratis: al aprobar a un ingeniero nuevo, 14 días de Pro
--      (suscripciones.prueba). No cuenta como ingreso en Métricas ni en Planes.
--   2. Diseños con IA por mes: Free 3, Pro y Negocio 30 (crear o cambiar uno
--      cuenta como un uso; el administrador, sin límite). Los topes viven en
--      limites_ia. Si la IA falla, el uso se devuelve.
--   3. Estadísticas completas de su página: Free ve solo las visitas.
--   4. Insignia «Pro»: `destacado` en su página pública (aquí) y en los
--      diseños de la portada y de cada rubro (supabase_destacados.sql).
--   5. alcance_semana(): visitas y pruebas de la semana en AIB+, para
--      mostrarle a un ingeniero Free lo que se pierde, con números reales.
--
-- Ejecutar después de supabase_planes.sql, supabase_invitaciones.sql,
-- supabase_estadisticas_perfil.sql, supabase_portafolio.sql,
-- supabase_metricas.sql y supabase_recordatorios.sql. Se puede ejecutar más
-- de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Prueba gratis de Pro
-- ----------------------------------------------------------------------------
ALTER TABLE public.suscripciones ADD COLUMN IF NOT EXISTS prueba BOOLEAN NOT NULL DEFAULT false;

-- Igual que en supabase_planes.sql; al pagar (o regalar meses), deja de ser prueba.
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
  -- Los días que le quedan (también los de la prueba) se suman.
  v_desde := CASE WHEN v_sub.plan = p_plan AND v_sub.vence_en > now() THEN v_sub.vence_en ELSE now() END;

  INSERT INTO public.suscripciones (user_id, plan, vence_en, prueba)
  VALUES (p_usuario, p_plan, v_desde + make_interval(days => 30 * p_meses), false)
  ON CONFLICT (user_id) DO UPDATE
    SET plan = EXCLUDED.plan, vence_en = EXCLUDED.vence_en, prueba = false, actualizado_en = now();

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

-- Igual que en supabase_marketplace.sql; al aprobarlo por primera vez (nunca
-- tuvo plan), 14 días de Pro de regalo.
CREATE OR REPLACE FUNCTION public.revisar_ingeniero(p_usuario UUID, p_accion TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador revisa ingenieros' USING ERRCODE = '42501';
  END IF;
  IF p_usuario IS NULL OR p_usuario = auth.uid() THEN
    RETURN false;
  END IF;

  SELECT estado INTO v_estado FROM public.perfiles_ingeniero WHERE user_id = p_usuario FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_accion = 'aprobar' AND v_estado IN ('pendiente', 'rechazado') THEN
    UPDATE public.perfiles_ingeniero SET estado = 'aprobado', revisado_en = now() WHERE user_id = p_usuario;
    INSERT INTO public.perfiles (user_id, rol) VALUES (p_usuario, 'ingeniero')
    ON CONFLICT (user_id) DO UPDATE SET rol = 'ingeniero';
    INSERT INTO public.suscripciones (user_id, plan, vence_en, prueba)
    VALUES (p_usuario, 'pro', now() + interval '14 days', true)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF p_accion = 'rechazar' AND v_estado = 'pendiente' THEN
    UPDATE public.perfiles_ingeniero SET estado = 'rechazado', revisado_en = now() WHERE user_id = p_usuario;
  ELSIF p_accion = 'pausar' AND v_estado = 'aprobado' THEN
    UPDATE public.perfiles_ingeniero SET estado = 'pausado', revisado_en = now() WHERE user_id = p_usuario;
  ELSIF p_accion = 'reactivar' AND v_estado = 'pausado' THEN
    UPDATE public.perfiles_ingeniero SET estado = 'aprobado', revisado_en = now() WHERE user_id = p_usuario;
  ELSE
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- Igual que en supabase_planes.sql, más `prueba` en su plan.
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
      'plan', v_sub.plan, 'vence_en', v_sub.vence_en, 'vigente', v_sub.vence_en > now(), 'prueba', v_sub.prueba
    ) END,
    'por_equipo', public.plan_propio(v_yo) = 'free' AND public.dueno_de_mi_equipo() IS NOT NULL,
    'pedido', CASE WHEN v_pedido.id IS NULL THEN NULL ELSE jsonb_build_object(
      'plan', v_pedido.plan, 'creado_en', v_pedido.creado_en
    ) END,
    'precios', jsonb_build_object('pro', v_config.precio_pro, 'negocio', v_config.precio_negocio),
    'yape', CASE WHEN v_config.yape_numero IS NULL OR v_pedido.id IS NULL THEN NULL ELSE jsonb_build_object(
      'numero', v_config.yape_numero, 'titular', v_config.yape_titular
    ) END
  );
END;
$$;

-- La prueba no es un ingreso: Métricas, Planes y el recordatorio de «Hoy».
-- Son cambios de una línea en funciones largas: se reemplaza el texto exacto
-- (y se comprueba que aparezca una sola vez) en vez de copiarlas enteras. Si
-- ya estaba hecho, no se toca.
DO $ajustes$
DECLARE
  v_def TEXT;
BEGIN
  -- metricas_admin: planes activos e ingreso mensual sin las pruebas.
  v_def := pg_get_functiondef('public.metricas_admin(integer)'::regprocedure);
  IF position('AND NOT prueba' IN v_def) = 0 THEN
    IF array_length(string_to_array(v_def, 'WHERE plan = ''pro'' AND vence_en > now()'), 1) <> 2
       OR array_length(string_to_array(v_def, 'WHERE plan = ''negocio'' AND vence_en > now()'), 1) <> 2
       OR array_length(string_to_array(v_def, 'WHERE s.vence_en > now()'), 1) <> 2 THEN
      RAISE EXCEPTION 'metricas_admin cambió: revisar a mano';
    END IF;
    v_def := replace(v_def, 'WHERE plan = ''pro'' AND vence_en > now()', 'WHERE plan = ''pro'' AND vence_en > now() AND NOT prueba');
    v_def := replace(v_def, 'WHERE plan = ''negocio'' AND vence_en > now()', 'WHERE plan = ''negocio'' AND vence_en > now() AND NOT prueba');
    v_def := replace(v_def, 'WHERE s.vence_en > now()', 'WHERE s.vence_en > now() AND NOT s.prueba');
    EXECUTE v_def;
  END IF;

  -- planes_para_admin: lo mismo, cuántos están en prueba y la marca en cada ingeniero.
  v_def := pg_get_functiondef('public.planes_para_admin()'::regprocedure);
  IF position('en_prueba' IN v_def) = 0 THEN
    IF array_length(string_to_array(v_def, 'FROM public.suscripciones s WHERE s.vence_en > now()'), 1) <> 2
       OR array_length(string_to_array(v_def, 'WHERE s.plan = ''pro'' AND s.vence_en > now())'), 1) <> 2
       OR array_length(string_to_array(v_def, 'WHERE s.plan = ''negocio'' AND s.vence_en > now())'), 1) <> 2
       OR array_length(string_to_array(v_def, '''vence_en'', s.vence_en,'), 1) <> 2 THEN
      RAISE EXCEPTION 'planes_para_admin cambió: revisar a mano';
    END IF;
    v_def := replace(v_def, 'FROM public.suscripciones s WHERE s.vence_en > now()', 'FROM public.suscripciones s WHERE s.vence_en > now() AND NOT s.prueba');
    v_def := replace(v_def, 'WHERE s.plan = ''pro'' AND s.vence_en > now())', 'WHERE s.plan = ''pro'' AND s.vence_en > now() AND NOT s.prueba)');
    v_def := replace(v_def, 'WHERE s.plan = ''negocio'' AND s.vence_en > now())',
      'WHERE s.plan = ''negocio'' AND s.vence_en > now() AND NOT s.prueba),
      ''en_prueba'', (SELECT count(*) FROM public.suscripciones s WHERE s.prueba AND s.vence_en > now())');
    v_def := replace(v_def, '''vence_en'', s.vence_en,', '''vence_en'', s.vence_en,
        ''prueba'', COALESCE(s.prueba, false),');
    EXECUTE v_def;
  END IF;

  -- mis_recordatorios: el aviso de «Hoy» sabe si lo que vence es la prueba.
  v_def := pg_get_functiondef('public.mis_recordatorios()'::regprocedure);
  IF position('''prueba'', s.prueba' IN v_def) = 0 THEN
    IF array_length(string_to_array(v_def, '''vence_en'', s.vence_en,'), 1) <> 2 THEN
      RAISE EXCEPTION 'mis_recordatorios cambió: revisar a mano';
    END IF;
    v_def := replace(v_def, '''vence_en'', s.vence_en,', '''vence_en'', s.vence_en,
        ''prueba'', s.prueba,');
    EXECUTE v_def;
  END IF;
END;
$ajustes$;

-- ----------------------------------------------------------------------------
-- 2. Diseños con IA por mes, según el plan
-- ----------------------------------------------------------------------------
ALTER TABLE public.limites_ia ADD COLUMN IF NOT EXISTS disenos_mes_free INTEGER NOT NULL DEFAULT 3;
ALTER TABLE public.limites_ia ADD COLUMN IF NOT EXISTS disenos_mes_pro INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS public.disenos_ia_mes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- El primer día del mes, hora de Lima.
  mes     DATE NOT NULL,
  usados  INTEGER NOT NULL DEFAULT 0 CHECK (usados >= 0),
  PRIMARY KEY (user_id, mes)
);

ALTER TABLE public.disenos_ia_mes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.disenos_ia_mes FROM anon, authenticated;

-- Cuántos puede hacer al mes. NULL: sin límite (el administrador).
CREATE OR REPLACE FUNCTION public.limite_disenos_ia(p_usuario UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE public.plan_de(p_usuario)
    WHEN 'admin' THEN NULL
    WHEN 'free' THEN l.disenos_mes_free
    ELSE l.disenos_mes_pro
  END
  FROM public.limites_ia l WHERE l.id;
$$;

REVOKE ALL ON FUNCTION public.limite_disenos_ia(UUID) FROM PUBLIC, anon, authenticated;

-- Para el panel: cuántos lleva este mes y cuántos puede.
CREATE OR REPLACE FUNCTION public.mis_disenos_ia()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.es_ingeniero() THEN NULL ELSE jsonb_build_object(
    'usados', COALESCE((
      SELECT d.usados FROM public.disenos_ia_mes d
      WHERE d.user_id = auth.uid() AND d.mes = date_trunc('month', now() AT TIME ZONE 'America/Lima')::date
    ), 0),
    'limite', public.limite_disenos_ia(auth.uid()),
    'plan', public.plan_de(auth.uid())
  ) END;
$$;

REVOKE ALL ON FUNCTION public.mis_disenos_ia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_disenos_ia() TO authenticated;

-- Igual que en supabase_invitaciones.sql, más el tope mensual de diseños:
-- devuelve 'limite_plan' si ya usó los de su plan este mes.
CREATE OR REPLACE FUNCTION public.reservar_cuota_ia(p_tipo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Lima')::date;
  v_mes DATE := date_trunc('month', now() AT TIME ZONE 'America/Lima')::date;
  coste INTEGER;
  limites public.limites_ia%ROWTYPE;
  limite_usuario INTEGER;
  limite_mes INTEGER;
  gastado_global INTEGER;
  nuevo INTEGER;
  invitacion_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'sin_sesion';
  END IF;

  coste := CASE p_tipo
    WHEN 'preguntas' THEN 1
    WHEN 'plantilla' THEN 3
    WHEN 'preview-web' THEN 6
    WHEN 'documentacion' THEN 6
    WHEN 'prototipo' THEN 25
    WHEN 'abi' THEN 5  -- una pregunta a ABI (puede consultar varias veces tus datos)
    WHEN 'diseno' THEN 20  -- un diseño hecho por IA para el catálogo del ingeniero (~17 ¢)
  END;
  IF coste IS NULL THEN
    RETURN 'tipo_desconocido';
  END IF;

  IF p_tipo = 'diseno' THEN
    limite_mes := public.limite_disenos_ia(auth.uid());
    IF limite_mes IS NOT NULL AND COALESCE((
      SELECT d.usados FROM public.disenos_ia_mes d WHERE d.user_id = auth.uid() AND d.mes = v_mes
    ), 0) >= limite_mes THEN
      RETURN 'limite_plan';
    END IF;
  END IF;

  SELECT * INTO limites FROM public.limites_ia WHERE id;
  limite_usuario := CASE WHEN public.es_ingeniero() THEN limites.ingeniero_centimos ELSE limites.usuario_centimos END;

  IF coste > limite_usuario THEN
    RETURN 'limite_usuario';
  END IF;

  IF public.es_anonimo() THEN
    SELECT id INTO invitacion_id FROM public.invitaciones WHERE cliente_id = auth.uid() AND activa;
    IF invitacion_id IS NULL THEN
      RETURN 'sin_invitacion';
    END IF;
    UPDATE public.invitaciones
    SET centimos_ia = centimos_ia + coste
    WHERE id = invitacion_id AND centimos_ia + coste <= limites.invitado_centimos;
    IF NOT FOUND THEN
      RETURN 'limite_usuario';
    END IF;
  END IF;

  SELECT COALESCE(sum(centimos), 0) INTO gastado_global FROM public.uso_ia WHERE dia = hoy;
  IF gastado_global + coste > limites.global_centimos THEN
    IF invitacion_id IS NOT NULL THEN
      UPDATE public.invitaciones SET centimos_ia = centimos_ia - coste WHERE id = invitacion_id;
    END IF;
    RETURN 'limite_global';
  END IF;

  INSERT INTO public.uso_ia AS u (user_id, dia, centimos)
  VALUES (auth.uid(), hoy, coste)
  ON CONFLICT (user_id, dia) DO UPDATE
    SET centimos = u.centimos + EXCLUDED.centimos
    WHERE u.centimos + EXCLUDED.centimos <= limite_usuario
  RETURNING centimos INTO nuevo;

  IF nuevo IS NULL THEN
    IF invitacion_id IS NOT NULL THEN
      UPDATE public.invitaciones SET centimos_ia = centimos_ia - coste WHERE id = invitacion_id;
    END IF;
    RETURN 'limite_usuario';
  END IF;

  IF p_tipo = 'diseno' THEN
    INSERT INTO public.disenos_ia_mes AS d (user_id, mes, usados)
    VALUES (auth.uid(), v_mes, 1)
    ON CONFLICT (user_id, mes) DO UPDATE SET usados = d.usados + 1;
  END IF;
  RETURN 'ok';
END;
$$;

-- Igual que en supabase_invitaciones.sql, más devolver el diseño del mes.
CREATE OR REPLACE FUNCTION public.devolver_cuota_ia(p_tipo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Lima')::date;
  coste INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'sin_sesion';
  END IF;

  coste := CASE p_tipo
    WHEN 'preguntas' THEN 1
    WHEN 'plantilla' THEN 3
    WHEN 'preview-web' THEN 6
    WHEN 'documentacion' THEN 6
    WHEN 'prototipo' THEN 25
    WHEN 'abi' THEN 5
    WHEN 'diseno' THEN 20
  END;
  IF coste IS NULL THEN
    RETURN 'tipo_desconocido';
  END IF;

  UPDATE public.uso_ia
  SET centimos = centimos - coste,
      devoluciones = devoluciones + 1
  WHERE user_id = auth.uid() AND dia = hoy AND devoluciones < 3 AND centimos >= coste;
  IF NOT FOUND THEN
    RETURN 'sin_devolucion';
  END IF;

  IF p_tipo = 'diseno' THEN
    UPDATE public.disenos_ia_mes
    SET usados = usados - 1
    WHERE user_id = auth.uid() AND mes = date_trunc('month', now() AT TIME ZONE 'America/Lima')::date AND usados > 0;
  END IF;

  IF public.es_anonimo() THEN
    UPDATE public.invitaciones
    SET centimos_ia = GREATEST(centimos_ia - coste, 0)
    WHERE cliente_id = auth.uid() AND activa;
  END IF;
  RETURN 'ok';
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Estadísticas completas solo con Pro o Negocio
-- ----------------------------------------------------------------------------
-- Igual que en supabase_estadisticas_perfil.sql: con Free, solo las visitas
-- y `completas` en false.
CREATE OR REPLACE FUNCTION public.estadisticas_mi_pagina()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.es_ingeniero() THEN NULL ELSE
    jsonb_build_object(
      'visitas_30', (
        SELECT COALESCE(sum(v.visitas), 0) FROM public.visitas_perfil v
        WHERE v.ingeniero_id = auth.uid() AND v.dia > public.hoy_lima() - 30
      ),
      'visitas_7', (
        SELECT COALESCE(sum(v.visitas), 0) FROM public.visitas_perfil v
        WHERE v.ingeniero_id = auth.uid() AND v.dia > public.hoy_lima() - 7
      ),
      'completas', public.plan_de(auth.uid()) <> 'free'
    )
    || CASE WHEN public.plan_de(auth.uid()) = 'free' THEN '{}'::jsonb ELSE jsonb_build_object(
      'empezaron', (
        SELECT count(*) FROM public.invitaciones i
        WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
      ),
      'vieron', (
        SELECT count(*) FROM public.invitaciones i
        WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
          AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.user_id = i.cliente_id)
      ),
      'eligieron', (
        SELECT count(*) FROM public.invitaciones i
        WHERE i.ingeniero_id = auth.uid() AND i.canal = 'perfil' AND i.created_at > now() - interval '30 days'
          AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.user_id = i.cliente_id AND p.payload->>'aceptado' = 'true')
      )
    ) END
  END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Insignia «Pro» en la página pública
-- ----------------------------------------------------------------------------
-- Igual que en supabase_portafolio.sql, más `destacado`.
CREATE OR REPLACE FUNCTION public.perfil_publico(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', pi.user_id,
    'slug', pi.slug,
    'nombre', pi.nombre,
    'titular', pi.titular,
    'bio', pi.bio,
    'especialidades', to_jsonb(pi.especialidades),
    'servicios', to_jsonb(pi.servicios),
    'servicios_otros', to_jsonb(pi.servicios_otros),
    'anios_experiencia', pi.anios_experiencia,
    'ciudad', pi.ciudad,
    'portafolio_url', pi.portafolio_url,
    'foto_url', pi.foto_url,
    'verificado', pi.verificado_en IS NOT NULL,
    'destacado', public.plan_de(pi.user_id) <> 'free',
    'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'publicadas', (
      SELECT count(*) FROM public.proyectos p
      WHERE p.ingeniero_id = pi.user_id
        AND (SELECT se.estado FROM public.seguimiento_encargos se WHERE se.proyecto_id = p.id
             ORDER BY se.created_at DESC, se.id DESC LIMIT 1) = 'publicada'
    ),
    'ultimas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'estrellas', r.estrellas,
        'comentario', r.comentario,
        'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
        'negocio', p.payload->'ficha'->>'empresa',
        'fecha', r.creada_en
      ) ORDER BY r.creada_en DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 10) r
      JOIN public.proyectos p ON p.id = r.proyecto_id
    ),
    'disenos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tipo', t.tipo, 'servicio', t.servicio, 'base', t.base, 'nombre', t.nombre,
        'descripcion', t.descripcion, 'categoria', t.categoria, 'estilo', t.estilo,
        'etiquetas', to_jsonb(t.etiquetas), 'nivel', t.nivel, 'precio_desde', t.precio_desde,
        'color_primario', t.color_primario, 'color_secundario', t.color_secundario,
        'html', t.html, 'css', t.css, 'fuentes', to_jsonb(t.fuentes)
      ) ORDER BY t.nivel, t.precio_desde NULLS LAST, t.created_at), '[]'::jsonb)
      FROM (
        SELECT * FROM public.plantillas
        WHERE ingeniero_id = pi.user_id AND activa AND nivel <> 'premium'
        ORDER BY created_at
        LIMIT 12
      ) t
    ),
    'trabajos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', w.id, 'titulo', w.titulo, 'servicio', w.servicio, 'enlace', w.enlace,
        'descripcion', w.descripcion, 'imagen_url', w.imagen_url
      ) ORDER BY w.orden, w.creado_en), '[]'::jsonb)
      FROM public.portafolio_ingeniero w
      WHERE w.ingeniero_id = pi.user_id
    )
  )
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

-- ----------------------------------------------------------------------------
-- 5. Lo que se pierde un ingeniero Free, con números reales
-- ----------------------------------------------------------------------------
-- Visitas a AIB+ y pruebas de clientes reales de los últimos 7 días. Solo
-- totales, para cualquier ingeniero.
CREATE OR REPLACE FUNCTION public.alcance_semana()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN NOT public.es_ingeniero() THEN NULL ELSE jsonb_build_object(
    'visitas', (SELECT COALESCE(sum(v.visitas), 0) FROM public.visitas_portada v WHERE v.dia > public.hoy_lima() - 7),
    'pruebas', (
      SELECT count(*) FROM public.invitaciones i
      WHERE NOT i.es_prueba AND i.empezada_en > now() - interval '7 days'
    )
  ) END;
$$;

REVOKE ALL ON FUNCTION public.alcance_semana() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alcance_semana() TO authenticated;
