-- ============================================================================
-- AIB+ — Formularios y plantillas por servicio
-- ============================================================================
-- Cada servicio (web, CRM, ERP, automatización, app móvil o uno escrito a mano
-- en «Otro») tiene:
--   1. sus plantillas: cada ingeniero sube diseños para cada servicio que
--      ofrece, y el cliente elige uno antes de contratarlo;
--   2. su formulario: AIB+ trae las preguntas base (en el código, en
--      src/lib/servicios.ts) y cada ingeniero añade las suyas (hasta 5; en
--      sus servicios «Otro», hasta 8).
--
-- Qué servicios ve el cliente:
--   - el que llegó con el enlace de un ingeniero: los de ese ingeniero;
--   - el que llegó por la plataforma: los que ofrece al menos un ingeniero
--     aprobado, y siempre la web.
--
-- Ejecutar después de supabase_perfil_publico.sql. Se puede ejecutar más de
-- una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Claves de servicio
-- ----------------------------------------------------------------------------
-- 'web' (incluye la tienda online), 'crm', 'erp', 'automatizacion',
-- 'app-movil', u 'otro:<nombre>' para los que el ingeniero escribió a mano.
CREATE OR REPLACE FUNCTION public.clave_servicio_valida(p_clave TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_clave IN ('web', 'crm', 'erp', 'automatizacion', 'app-movil')
      OR (p_clave LIKE 'otro:%' AND char_length(substr(p_clave, 6)) BETWEEN 2 AND 60 AND p_clave !~ '[<>{}]');
$$;

-- Los servicios del perfil, como los ve el cliente: la tienda online es una
-- web y «Otro» va aparte (servicios_otros).
CREATE OR REPLACE FUNCTION public.servicios_cliente(p_servicios TEXT[])
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(v.clave ORDER BY v.orden), '{}')
  FROM (VALUES ('web', 1), ('crm', 2), ('erp', 3), ('automatizacion', 4), ('app-movil', 5)) AS v(clave, orden)
  WHERE v.clave = ANY (p_servicios) OR (v.clave = 'web' AND 'tienda-online' = ANY (p_servicios));
$$;

-- ----------------------------------------------------------------------------
-- 2. El servicio de cada plantilla
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas ADD COLUMN IF NOT EXISTS servicio TEXT NOT NULL DEFAULT 'web';

-- Las de la biblioteca de AIB+ son páginas web.
ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_servicio_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_servicio_check
  CHECK (public.clave_servicio_valida(servicio) AND (tipo = 'propia' OR servicio = 'web'));

-- Si el ingeniero de la invitación aún no tiene diseños de un servicio, su
-- cliente ve los de AIB+ de ese servicio (antes: solo si no tenía ninguno).
CREATE OR REPLACE FUNCTION public.plantillas_visibles()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
  v_premium   BOOLEAN := false;
BEGIN
  SELECT i.ingeniero_id, i.con_premium INTO v_ingeniero, v_premium
  FROM public.invitaciones i
  WHERE i.cliente_id = auth.uid() AND i.origen = 'ingeniero'
  LIMIT 1;

  IF v_ingeniero IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id FROM public.plantillas p
      WHERE p.activa
        AND (
          (p.ingeniero_id = v_ingeniero AND (p.nivel <> 'premium' OR v_premium))
          OR (
            p.nivel <> 'premium'
            AND public.es_admin_id(p.ingeniero_id)
            AND NOT EXISTS (
              SELECT 1 FROM public.plantillas q
              WHERE q.ingeniero_id = v_ingeniero AND q.activa AND q.servicio = p.servicio
            )
          )
        );
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id FROM public.plantillas p
    WHERE p.activa
      AND p.nivel <> 'premium'
      AND (
        public.es_admin_id(p.ingeniero_id)
        OR EXISTS (
          SELECT 1 FROM public.perfiles_ingeniero pi
          WHERE pi.user_id = p.ingeniero_id AND pi.estado = 'aprobado' AND public.es_ingeniero_id(pi.user_id)
        )
      );
END;
$$;

REVOKE ALL ON FUNCTION public.plantillas_visibles() FROM PUBLIC, anon, authenticated;

-- La misma de supabase_plantillas_propias.sql, con el servicio.
CREATE OR REPLACE FUNCTION public.catalogo_cliente()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'ingeniero_id', p.ingeniero_id,
    'base', p.base,
    'tipo', p.tipo,
    'servicio', p.servicio,
    'nivel', p.nivel,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'categoria', p.categoria,
    'estilo', p.estilo,
    'etiquetas', to_jsonb(p.etiquetas),
    'activa', p.activa,
    'precio_desde', p.precio_desde,
    'color_primario', p.color_primario,
    'color_secundario', p.color_secundario,
    'veces_mostrada', p.veces_mostrada,
    'veces_elegida', p.veces_elegida,
    'veces_aceptada', p.veces_aceptada,
    'created_at', p.created_at,
    'ingeniero', jsonb_build_object(
      'id', p.ingeniero_id,
      'es_admin', public.es_admin_id(p.ingeniero_id),
      'nombre', pi.nombre,
      'foto_url', pi.foto_url,
      'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = p.ingeniero_id),
      'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = p.ingeniero_id)
    )
  )), '[]'::jsonb)
  FROM public.plantillas p
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = p.ingeniero_id
  WHERE p.id IN (SELECT public.plantillas_visibles());
$$;

REVOKE ALL ON FUNCTION public.catalogo_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_cliente() TO authenticated;

-- La misma de supabase_perfil_publico.sql, con el servicio de cada diseño.
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
    )
  )
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.perfil_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perfil_publico(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Las preguntas de cada ingeniero
-- ----------------------------------------------------------------------------
-- Cada pregunta: { id, titulo, tipo: 'texto' | 'opcion' | 'multiple',
-- opciones: [..] (de 2 a 8, salvo en 'texto') }. Los ids los pone la base de
-- datos (p1, p2…) según el orden.
CREATE TABLE IF NOT EXISTS public.formularios_ingeniero (
  ingeniero_id   UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  servicio       TEXT NOT NULL CHECK (public.clave_servicio_valida(servicio)),
  preguntas      JSONB NOT NULL DEFAULT '[]',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ingeniero_id, servicio)
);

ALTER TABLE public.formularios_ingeniero ENABLE ROW LEVEL SECURITY;

-- Se escriben solo con guardar_formulario; cada ingeniero lee los suyos.
REVOKE ALL ON public.formularios_ingeniero FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.formularios_ingeniero FROM authenticated;
GRANT SELECT ON public.formularios_ingeniero TO authenticated;

DROP POLICY IF EXISTS "El ingeniero ve sus formularios" ON public.formularios_ingeniero;
CREATE POLICY "El ingeniero ve sus formularios" ON public.formularios_ingeniero
  FOR SELECT TO authenticated USING (ingeniero_id = (SELECT auth.uid()));

-- Limpia y valida las preguntas. NULL si algo no sirve.
CREATE OR REPLACE FUNCTION public.limpiar_preguntas(p_preguntas JSONB, p_maximo INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_salida   JSONB := '[]';
  v_opciones JSONB;
  v_pregunta JSONB;
  v_opcion   JSONB;
  v_titulo   TEXT;
  v_tipo     TEXT;
  v_texto    TEXT;
  v_n        INTEGER := 0;
BEGIN
  IF p_preguntas IS NULL OR jsonb_typeof(p_preguntas) <> 'array' OR jsonb_array_length(p_preguntas) > p_maximo THEN
    RETURN NULL;
  END IF;

  FOR v_pregunta IN SELECT * FROM jsonb_array_elements(p_preguntas) LOOP
    IF jsonb_typeof(v_pregunta) <> 'object' THEN
      RETURN NULL;
    END IF;
    v_n := v_n + 1;
    v_titulo := btrim(COALESCE(v_pregunta->>'titulo', ''));
    v_tipo := v_pregunta->>'tipo';
    IF char_length(v_titulo) NOT BETWEEN 3 AND 140 OR v_titulo ~ '[<>{}]'
       OR v_tipo IS NULL OR v_tipo NOT IN ('texto', 'opcion', 'multiple') THEN
      RETURN NULL;
    END IF;

    IF v_tipo = 'texto' THEN
      v_salida := v_salida || jsonb_build_array(jsonb_build_object('id', 'p' || v_n, 'titulo', v_titulo, 'tipo', v_tipo));
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_pregunta->'opciones') IS DISTINCT FROM 'array' THEN
      RETURN NULL;
    END IF;
    v_opciones := '[]';
    FOR v_opcion IN SELECT * FROM jsonb_array_elements(v_pregunta->'opciones') LOOP
      IF jsonb_typeof(v_opcion) <> 'string' THEN
        RETURN NULL;
      END IF;
      v_texto := btrim(v_opcion #>> '{}');
      CONTINUE WHEN v_texto = '';
      IF char_length(v_texto) > 60 OR v_texto ~ '[<>{}]' THEN
        RETURN NULL;
      END IF;
      IF NOT v_opciones @> jsonb_build_array(v_texto) THEN
        v_opciones := v_opciones || jsonb_build_array(v_texto);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_opciones) NOT BETWEEN 2 AND 8 THEN
      RETURN NULL;
    END IF;
    v_salida := v_salida || jsonb_build_array(
      jsonb_build_object('id', 'p' || v_n, 'titulo', v_titulo, 'tipo', v_tipo, 'opciones', v_opciones)
    );
  END LOOP;

  RETURN v_salida;
END;
$$;

REVOKE ALL ON FUNCTION public.limpiar_preguntas(JSONB, INTEGER) FROM PUBLIC, anon, authenticated;

-- El ingeniero guarda sus preguntas de un servicio que ofrece. Una lista vacía
-- las borra (queda solo el formulario de AIB+).
CREATE OR REPLACE FUNCTION public.guardar_formulario(p_servicio TEXT, p_preguntas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ofrece  BOOLEAN;
  v_limpias JSONB;
BEGIN
  IF NOT public.es_ingeniero() THEN
    RETURN jsonb_build_object('estado', 'no_ingeniero');
  END IF;

  SELECT CASE
           WHEN p_servicio LIKE 'otro:%' THEN substr(p_servicio, 6) = ANY (pi.servicios_otros)
           ELSE p_servicio = ANY (public.servicios_cliente(pi.servicios))
         END
    INTO v_ofrece
  FROM public.perfiles_ingeniero pi
  WHERE pi.user_id = auth.uid();

  -- El administrador sin perfil de ingeniero ofrece los servicios de AIB+.
  IF v_ofrece IS NULL AND public.es_admin_id(auth.uid()) THEN
    v_ofrece := public.clave_servicio_valida(p_servicio) AND p_servicio NOT LIKE 'otro:%';
  END IF;
  IF NOT COALESCE(v_ofrece, false) THEN
    RETURN jsonb_build_object('estado', 'no_ofrece');
  END IF;

  v_limpias := public.limpiar_preguntas(p_preguntas, CASE WHEN p_servicio LIKE 'otro:%' THEN 8 ELSE 5 END);
  IF v_limpias IS NULL THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;

  IF jsonb_array_length(v_limpias) = 0 THEN
    DELETE FROM public.formularios_ingeniero WHERE ingeniero_id = auth.uid() AND servicio = p_servicio;
  ELSE
    INSERT INTO public.formularios_ingeniero (ingeniero_id, servicio, preguntas)
    VALUES (auth.uid(), p_servicio, v_limpias)
    ON CONFLICT (ingeniero_id, servicio)
      DO UPDATE SET preguntas = EXCLUDED.preguntas, actualizado_en = now();
  END IF;

  RETURN jsonb_build_object('estado', 'ok', 'preguntas', v_limpias);
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_formulario(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_formulario(TEXT, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Lo que ve el cliente
-- ----------------------------------------------------------------------------
-- Qué servicios puede pedir. Ver la cabecera del archivo.
CREATE OR REPLACE FUNCTION public.servicios_para_cliente()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
  v_servicios TEXT[];
  v_otros     TEXT[];
  v_nombre    TEXT;
BEGIN
  SELECT i.ingeniero_id INTO v_ingeniero
  FROM public.invitaciones i
  WHERE i.cliente_id = auth.uid() AND i.origen = 'ingeniero'
  LIMIT 1;

  IF v_ingeniero IS NOT NULL THEN
    SELECT pi.servicios, pi.servicios_otros, pi.nombre INTO v_servicios, v_otros, v_nombre
    FROM public.perfiles_ingeniero pi
    WHERE pi.user_id = v_ingeniero;

    RETURN jsonb_build_object(
      'origen', 'ingeniero',
      'ingeniero', v_nombre,
      -- Sin perfil (el administrador): la web, como siempre.
      'servicios', to_jsonb(public.servicios_cliente(COALESCE(v_servicios, '{web}'))),
      'otros', to_jsonb(COALESCE(v_otros, '{}'))
    );
  END IF;

  SELECT array_agg(DISTINCT s) INTO v_servicios
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  CROSS JOIN LATERAL unnest(pi.servicios) AS s
  WHERE pi.estado = 'aprobado';

  RETURN jsonb_build_object(
    'origen', 'plataforma',
    'ingeniero', NULL,
    'servicios', to_jsonb(public.servicios_cliente(COALESCE(v_servicios, '{}') || '{web}')),
    'otros', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.servicios_para_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.servicios_para_cliente() TO authenticated;

-- Las preguntas del ingeniero de la invitación para un servicio: su cliente
-- las responde junto con las de AIB+. Para el resto, ninguna.
CREATE OR REPLACE FUNCTION public.formulario_servicio(p_servicio TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT f.preguntas
    FROM public.invitaciones i
    JOIN public.formularios_ingeniero f ON f.ingeniero_id = i.ingeniero_id AND f.servicio = p_servicio
    WHERE i.cliente_id = auth.uid() AND i.origen = 'ingeniero'
    LIMIT 1
  ), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.formulario_servicio(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.formulario_servicio(TEXT) TO authenticated;

-- Las preguntas del ingeniero que se queda con el proyecto, para el último
-- paso al aceptar. El mismo orden que proteger_ingeniero_asignado: el
-- elegido, el de la invitación o el administrador.
CREATE OR REPLACE FUNCTION public.preguntas_para_encargo(p_proyecto UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT f.preguntas
    FROM public.proyectos p
    JOIN public.formularios_ingeniero f
      ON f.ingeniero_id = COALESCE(
           p.ingeniero_id,
           (SELECT i.ingeniero_id FROM public.invitaciones i WHERE i.cliente_id = p.user_id AND i.origen = 'ingeniero' LIMIT 1),
           (SELECT pf.user_id FROM public.perfiles pf WHERE pf.es_admin ORDER BY pf.created_at LIMIT 1)
         )
     AND f.servicio = CASE
           WHEN p.payload->>'tipo_servicio' = 'otro' THEN 'otro:' || COALESCE(p.payload->>'servicio_otro', '')
           ELSE COALESCE(p.payload->>'tipo_servicio', '')
         END
    WHERE p.id = p_proyecto AND p.user_id = auth.uid()
  ), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.preguntas_para_encargo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preguntas_para_encargo(UUID) TO authenticated;
