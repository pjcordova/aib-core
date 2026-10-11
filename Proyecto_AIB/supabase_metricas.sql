-- ============================================================================
-- AIB+ — Métricas semanales para el administrador (informes de Santander X)
-- ============================================================================
-- metricas_admin(p_semanas) devuelve, por semana (de lunes a domingo, hora de
-- Lima), el embudo del marketplace y la actividad de los ingenieros, más un
-- resumen del estado actual. Solo totales: ningún dato personal.
--
--   visitas     visitas a la portada (visitas_portada)
--   pruebas     pruebas que alguien empezó a responder (invitaciones.empezada_en)
--   proyectos   vistas previas guardadas
--   encargos    proyectos enviados a un ingeniero (payload.aceptado_en)
--   propuestas  propuestas enviadas; aceptadas y vendido (S/) por fecha de respuesta
--   ingenieros  postulaciones nuevas; disenos: diseños nuevos de los ingenieros
--   resenas     reseñas nuevas
--   ingresos    lo que cobró AIB+ por planes (pagos_plan)
--
-- Los proyectos que hacen los propios ingenieros («Probar como cliente») no
-- cuentan: son pruebas, no clientes.
--
-- Ejecutar después de supabase_planes.sql, supabase_propuestas.sql y
-- supabase_verificados.sql. Se puede ejecutar más de una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.metricas_admin(p_semanas INTEGER DEFAULT 8)
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
    WITH clientes_proyectos AS (
      -- Proyectos de clientes (no de ingenieros probando), con su fecha de Lima.
      SELECT p.id,
             (p.created_at AT TIME ZONE 'America/Lima')::date AS creado,
             CASE WHEN p.payload->>'aceptado_en' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN ((p.payload->>'aceptado_en')::timestamptz AT TIME ZONE 'America/Lima')::date END AS enviado
      FROM public.proyectos p
      WHERE NOT EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.user_id = p.user_id AND pf.rol = 'ingeniero')
    ),
    semanas AS (
      SELECT (v_inicio + 7 * n)::date AS lunes FROM generate_series(0, v_semanas - 1) AS n
    ),
    config AS (
      SELECT precio_pro, precio_negocio FROM public.config_planes WHERE id LIMIT 1
    )
    SELECT jsonb_build_object(
      'generado', now(),
      'semanas', (
        SELECT jsonb_agg(jsonb_build_object(
          'semana', s.lunes,
          'visitas', COALESCE((SELECT sum(v.visitas) FROM public.visitas_portada v
                               WHERE v.dia >= s.lunes AND v.dia < s.lunes + 7), 0),
          'pruebas', (SELECT count(*) FROM public.invitaciones i
                      WHERE (i.empezada_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                        AND (i.empezada_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'proyectos', (SELECT count(*) FROM clientes_proyectos c WHERE c.creado >= s.lunes AND c.creado < s.lunes + 7),
          'encargos', (SELECT count(*) FROM clientes_proyectos c WHERE c.enviado >= s.lunes AND c.enviado < s.lunes + 7),
          'propuestas', (SELECT count(*) FROM public.propuestas pr
                         WHERE (pr.creada_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                           AND (pr.creada_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'aceptadas', (SELECT count(*) FROM public.propuestas pr
                        WHERE pr.estado = 'aceptada'
                          AND (pr.respondida_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                          AND (pr.respondida_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'vendido', COALESCE((SELECT sum(pr.precio) FROM public.propuestas pr
                               WHERE pr.estado = 'aceptada'
                                 AND (pr.respondida_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                                 AND (pr.respondida_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7), 0),
          'ingenieros', (SELECT count(*) FROM public.perfiles_ingeniero pi
                         WHERE (pi.creado_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                           AND (pi.creado_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'disenos', (SELECT count(*) FROM public.plantillas t
                      WHERE t.ingeniero_id IS NOT NULL
                        AND (t.created_at AT TIME ZONE 'America/Lima')::date >= s.lunes
                        AND (t.created_at AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'resenas', (SELECT count(*) FROM public.resenas r
                      WHERE (r.creada_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                        AND (r.creada_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7),
          'ingresos', COALESCE((SELECT sum(pp.monto) FROM public.pagos_plan pp
                                WHERE (pp.registrado_en AT TIME ZONE 'America/Lima')::date >= s.lunes
                                  AND (pp.registrado_en AT TIME ZONE 'America/Lima')::date < s.lunes + 7), 0)
        ) ORDER BY s.lunes)
        FROM semanas s
      ),
      'actual', jsonb_build_object(
        'ingenieros_aprobados', (SELECT count(*) FROM public.perfiles_ingeniero WHERE estado = 'aprobado'),
        'ingenieros_verificados', (SELECT count(*) FROM public.perfiles_ingeniero WHERE estado = 'aprobado' AND verificado_en IS NOT NULL),
        'ingenieros_pendientes', (SELECT count(*) FROM public.perfiles_ingeniero WHERE estado = 'pendiente'),
        'ingenieros_con_disenos', (
          SELECT count(DISTINCT t.ingeniero_id) FROM public.plantillas t
          JOIN public.perfiles_ingeniero pi ON pi.user_id = t.ingeniero_id AND pi.estado = 'aprobado'
          WHERE t.activa AND t.nivel <> 'premium'
        ),
        'disenos_publicados', (
          SELECT count(*) FROM public.plantillas t
          JOIN public.perfiles_ingeniero pi ON pi.user_id = t.ingeniero_id AND pi.estado = 'aprobado'
          WHERE t.activa AND t.nivel <> 'premium'
        ),
        'clientes_con_cuenta', (
          SELECT count(DISTINCT i.cliente_id) FROM public.invitaciones i
          JOIN auth.users u ON u.id = i.cliente_id AND NOT u.is_anonymous
          WHERE NOT EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.user_id = i.cliente_id AND pf.rol = 'ingeniero')
        ),
        'encargos', (SELECT count(*) FROM clientes_proyectos WHERE enviado IS NOT NULL),
        'propuestas_aceptadas', (SELECT count(*) FROM public.propuestas WHERE estado = 'aceptada'),
        'vendido', COALESCE((SELECT sum(precio) FROM public.propuestas WHERE estado = 'aceptada'), 0),
        'resenas', (SELECT count(*) FROM public.resenas),
        'promedio', (SELECT round(avg(estrellas), 1) FROM public.resenas),
        'planes_pro', (SELECT count(*) FROM public.suscripciones WHERE plan = 'pro' AND vence_en > now()),
        'planes_negocio', (SELECT count(*) FROM public.suscripciones WHERE plan = 'negocio' AND vence_en > now()),
        'ingreso_mensual', (
          SELECT COALESCE(sum(CASE s.plan WHEN 'pro' THEN c.precio_pro WHEN 'negocio' THEN c.precio_negocio ELSE 0 END), 0)
          FROM public.suscripciones s CROSS JOIN config c
          WHERE s.vence_en > now()
        )
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.metricas_admin(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_admin(INTEGER) TO authenticated;
