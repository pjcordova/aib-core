-- ============================================================================
-- AIB+ — Plantillas propias de cada ingeniero, niveles y servicios
-- ============================================================================
-- Cada ingeniero sube sus propios diseños (un HTML con huecos para el nombre y
-- los colores del cliente), les pone precio y decide cuáles publica. El
-- administrador conserva además la biblioteca de AIB+.
--
--   1. Niveles: básica, elaborada y premium. Las premium no se ven en la
--      plataforma: solo las ve el cliente al que el ingeniero se las habilita
--      en su invitación.
--   2. Qué ve cada cliente:
--        - el que llegó con el enlace de un ingeniero: solo los diseños de ese
--          ingeniero (si aún no tiene ninguno, los de la biblioteca de AIB+);
--        - el que llegó por la plataforma: los de todos los ingenieros
--          aprobados y los de AIB+, para elegir por precio y reseñas.
--   3. Servicios: cada ingeniero marca los que ofrece (web, CRM, ERP…).
--
-- Ejecutar después de supabase_marketplace.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Plantillas propias
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas
  ADD COLUMN IF NOT EXISTS tipo             TEXT NOT NULL DEFAULT 'biblioteca',
  ADD COLUMN IF NOT EXISTS nivel            TEXT NOT NULL DEFAULT 'basica',
  ADD COLUMN IF NOT EXISTS descripcion      TEXT,
  ADD COLUMN IF NOT EXISTS html             TEXT,
  ADD COLUMN IF NOT EXISTS css              TEXT,
  ADD COLUMN IF NOT EXISTS fuentes          TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS color_primario   TEXT,
  ADD COLUMN IF NOT EXISTS color_secundario TEXT;

-- Hojas externas (tipografías, Bootstrap…): solo https y sin caracteres raros.
CREATE OR REPLACE FUNCTION public.fuentes_validas(p_fuentes TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(bool_and(f ~ '^https://[^[:space:]<>"''()]+$' AND char_length(f) <= 500), true)
  FROM unnest(p_fuentes) AS f;
$$;

ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_tipo_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_tipo_check CHECK (tipo IN ('biblioteca', 'propia'));

ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_nivel_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_nivel_check CHECK (nivel IN ('basica', 'elaborada', 'premium'));

ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_descripcion_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_descripcion_check
  CHECK (descripcion IS NULL OR char_length(descripcion) <= 300);

ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_categoria_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_categoria_check
  CHECK (categoria IN ('tienda-ropa', 'servicios-profesionales', 'restaurante', 'salud-bienestar', 'institucion', 'otro'));

ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_colores_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_colores_check
  CHECK ((color_primario IS NULL OR color_primario ~ '^#[0-9a-fA-F]{6}$')
     AND (color_secundario IS NULL OR color_secundario ~ '^#[0-9a-fA-F]{6}$'));

-- Una propia trae su diseño, acotado en tamaño.
ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_propia_check;
ALTER TABLE public.plantillas ADD CONSTRAINT plantillas_propia_check
  CHECK (
    tipo = 'biblioteca'
    OR (
      base = 'propia'
      AND html IS NOT NULL
      AND octet_length(html) BETWEEN 20 AND 400000
      AND octet_length(COALESCE(css, '')) <= 200000
      AND cardinality(fuentes) <= 6
      AND public.fuentes_validas(fuentes)
    )
  );

-- La misma plantilla de la biblioteca, una vez por ingeniero; propias, varias.
ALTER TABLE public.plantillas DROP CONSTRAINT IF EXISTS plantillas_ingeniero_id_base_key;
CREATE UNIQUE INDEX IF NOT EXISTS plantillas_biblioteca_unica
  ON public.plantillas (ingeniero_id, base) WHERE tipo = 'biblioteca';
CREATE INDEX IF NOT EXISTS plantillas_ingeniero_idx ON public.plantillas (ingeniero_id);

-- Tope de diseños por ingeniero.
CREATE OR REPLACE FUNCTION public.limitar_plantillas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.plantillas WHERE ingeniero_id = NEW.ingeniero_id) >= 40 THEN
    RAISE EXCEPTION 'Llegaste al máximo de 40 plantillas' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limitar_plantillas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limitar_plantillas ON public.plantillas;
CREATE TRIGGER limitar_plantillas
  BEFORE INSERT ON public.plantillas
  FOR EACH ROW EXECUTE FUNCTION public.limitar_plantillas();

-- ----------------------------------------------------------------------------
-- 2. Premium por invitación
-- ----------------------------------------------------------------------------
ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS con_premium BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.premium_invitacion(p_id UUID, p_valor BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() THEN
    RETURN false;
  END IF;
  UPDATE public.invitaciones SET con_premium = COALESCE(p_valor, false)
  WHERE id = p_id AND ingeniero_id = auth.uid() AND origen = 'ingeniero';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.premium_invitacion(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.premium_invitacion(UUID, BOOLEAN) TO authenticated;

-- La misma vista de supabase_invitaciones.sql, con con_premium al final.
CREATE OR REPLACE VIEW public.invitaciones_resumen
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.token,
  i.negocio,
  i.es_prueba,
  i.activa,
  i.created_at,
  i.abierta_en,
  i.empezada_en,
  i.ultima_visita,
  i.centimos_ia,
  (SELECT min(p.created_at) FROM public.proyectos p WHERE p.user_id = i.cliente_id) AS maqueta_en,
  (SELECT min((p.payload->>'aceptado_en')::timestamptz)
     FROM public.proyectos p
     WHERE p.user_id = i.cliente_id AND p.payload->>'aceptado' = 'true') AS aceptada_en,
  i.origen,
  i.con_premium
FROM public.invitaciones i;

GRANT SELECT ON public.invitaciones_resumen TO authenticated;
REVOKE ALL ON public.invitaciones_resumen FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Servicios de cada ingeniero
-- ----------------------------------------------------------------------------
ALTER TABLE public.perfiles_ingeniero ADD COLUMN IF NOT EXISTS servicios TEXT[] NOT NULL DEFAULT '{web}';

ALTER TABLE public.perfiles_ingeniero DROP CONSTRAINT IF EXISTS perfiles_ingeniero_servicios_check;
ALTER TABLE public.perfiles_ingeniero ADD CONSTRAINT perfiles_ingeniero_servicios_check
  CHECK (
    cardinality(servicios) BETWEEN 1 AND 7
    AND servicios <@ ARRAY['web', 'tienda-online', 'crm', 'erp', 'automatizacion', 'app-movil', 'otro']
  );

CREATE OR REPLACE FUNCTION public.guardar_servicios_ingeniero(p_servicios TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.perfiles_ingeniero
  SET servicios = (SELECT COALESCE(array_agg(DISTINCT s), '{}') FROM unnest(p_servicios) s),
      actualizado_en = now()
  WHERE user_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_servicios_ingeniero(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_servicios_ingeniero(TEXT[]) TO authenticated;

-- La misma de supabase_marketplace.sql, con sus servicios.
CREATE OR REPLACE FUNCTION public.ingenieros_disponibles()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(x.fila ORDER BY x.promedio DESC NULLS LAST, x.resenas DESC, x.creado_en), '[]'::jsonb)
  FROM (
    SELECT
      pi.creado_en,
      (SELECT avg(r.estrellas) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS promedio,
      (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id) AS resenas,
      jsonb_build_object(
        'id', pi.user_id,
        'nombre', pi.nombre,
        'titular', pi.titular,
        'bio', pi.bio,
        'especialidades', to_jsonb(pi.especialidades),
        'servicios', to_jsonb(pi.servicios),
        'anios_experiencia', pi.anios_experiencia,
        'ciudad', pi.ciudad,
        'portafolio_url', pi.portafolio_url,
        'foto_url', pi.foto_url,
        'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
        'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
        'ultimas', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'estrellas', r.estrellas,
            'comentario', r.comentario,
            -- Solo el nombre de pila de quien la escribió.
            'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
            'negocio', p.payload->'ficha'->>'empresa',
            'fecha', r.creada_en
          ) ORDER BY r.creada_en DESC), '[]'::jsonb)
          FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 3) r
          JOIN public.proyectos p ON p.id = r.proyecto_id
        )
      ) AS fila
    FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.estado = 'aprobado'
  ) x;
$$;

REVOKE ALL ON FUNCTION public.ingenieros_disponibles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingenieros_disponibles() TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Qué plantillas ve cada cliente
-- ----------------------------------------------------------------------------
-- Las ids visibles para quien consulta. Ver la cabecera del archivo.
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
    IF EXISTS (SELECT 1 FROM public.plantillas WHERE ingeniero_id = v_ingeniero AND activa) THEN
      RETURN QUERY
        SELECT p.id FROM public.plantillas p
        WHERE p.ingeniero_id = v_ingeniero AND p.activa AND (p.nivel <> 'premium' OR v_premium);
    ELSE
      -- Su ingeniero aún no tiene diseños: los de la biblioteca de AIB+.
      RETURN QUERY
        SELECT p.id FROM public.plantillas p
        WHERE p.activa AND p.nivel <> 'premium' AND public.es_admin_id(p.ingeniero_id);
    END IF;
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

-- El catálogo para elegir: sin el diseño (pesa), con quién lo construye.
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

-- El diseño de las propias que se van a enseñar (solo de las visibles).
CREATE OR REPLACE FUNCTION public.contenido_plantillas(p_ids UUID[])
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'html', p.html, 'css', p.css, 'fuentes', to_jsonb(p.fuentes)
  )), '[]'::jsonb)
  FROM public.plantillas p
  WHERE p.id = ANY (p_ids[1:12])
    AND p.tipo = 'propia'
    AND p.id IN (SELECT public.plantillas_visibles());
$$;

REVOKE ALL ON FUNCTION public.catalogo_cliente() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contenido_plantillas(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_cliente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contenido_plantillas(UUID[]) TO authenticated;
