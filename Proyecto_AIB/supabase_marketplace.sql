-- ============================================================================
-- AIB+ — Marketplace: varios ingenieros, perfiles y reseñas
-- ============================================================================
-- AIB+ trae a los dueños de negocio; varios ingenieros les construyen la web.
--
--   1. El administrador (el primer ingeniero) ve todo; cada ingeniero, solo
--      lo suyo: los encargos que le eligieron y los clientes de sus
--      invitaciones.
--   2. Cualquiera con cuenta puede postular como ingeniero con su perfil; el
--      administrador aprueba, rechaza o pausa cada solicitud.
--   3. El cliente elige ingeniero al aceptar su web («¡Me gusta, sigamos!»)
--      entre los perfiles aprobados. El cliente de una invitación ya tiene el
--      suyo: el que lo invitó.
--   4. Cuando su web queda «publicada», el cliente puntúa a su ingeniero (de 1
--      a 5 estrellas) y deja un comentario, que se ve en su perfil.
--
-- Ejecutar el ÚLTIMO, después de todos los demás: sustituye las políticas de
-- «el ingeniero ve todo» de supabase_roles_plantillas.sql,
-- supabase_seguimiento.sql, supabase_comentarios.sql y
-- supabase_invitaciones.sql, y las funciones de métricas globales, que pasan a
-- ser solo del administrador. Se puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Administrador
-- ----------------------------------------------------------------------------
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT false;

-- El primer ingeniero es el administrador (no hay forma de cambiarlo desde la
-- app: perfiles no tiene políticas de escritura).
UPDATE public.perfiles SET es_admin = true
WHERE rol = 'ingeniero'
  AND user_id = (SELECT user_id FROM public.perfiles WHERE rol = 'ingeniero' ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM public.perfiles WHERE es_admin);

-- Como es_ingeniero(): lee el perfil propio con la política de siempre.
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE user_id = auth.uid() AND rol = 'ingeniero' AND es_admin
  );
$$;

REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated;

-- Para políticas y vistas que preguntan por OTRO usuario (la política de
-- perfiles solo deja ver el propio).
CREATE OR REPLACE FUNCTION public.es_ingeniero_id(p_usuario UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = p_usuario AND rol = 'ingeniero');
$$;

CREATE OR REPLACE FUNCTION public.es_admin_id(p_usuario UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = p_usuario AND rol = 'ingeniero' AND es_admin);
$$;

REVOKE ALL ON FUNCTION public.es_ingeniero_id(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.es_admin_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_ingeniero_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_admin_id(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Perfiles de ingeniero y solicitudes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles_ingeniero (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 2 AND 80),
  -- Una línea: «Ingeniero de software · webs para restaurantes».
  titular           TEXT NOT NULL CHECK (char_length(btrim(titular)) BETWEEN 3 AND 100),
  bio               TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 800),
  -- Los mismos rubros que el cuestionario (CATEGORIAS_NEGOCIO).
  especialidades    TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (cardinality(especialidades) <= 6
                           AND especialidades <@ ARRAY['tienda-ropa', 'servicios-profesionales', 'restaurante',
                                                       'salud-bienestar', 'institucion', 'otro']),
  anios_experiencia INTEGER CHECK (anios_experiencia IS NULL OR anios_experiencia BETWEEN 0 AND 60),
  ciudad            TEXT CHECK (ciudad IS NULL OR char_length(btrim(ciudad)) BETWEEN 1 AND 60),
  -- El largo va aparte: PostgreSQL no admite repeticiones de más de 255 en una
  -- expresión regular ({3,300} fallaba con cualquier enlace).
  portafolio_url    TEXT CHECK (portafolio_url IS NULL OR (portafolio_url ~* '^https?://[^[:space:]<>"]{3,}$' AND char_length(portafolio_url) <= 308)),
  -- Solo fotos de nuestro almacenamiento (supabase_fotos.sql).
  foto_url          TEXT CHECK (foto_url IS NULL
                                OR foto_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/[^[:space:]<>"]+$'),
  -- Privado: solo lo ven él y el administrador, para coordinar.
  whatsapp          TEXT CHECK (whatsapp IS NULL OR whatsapp ~ '^\+?[0-9 ]{9,16}$'),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'aprobado', 'rechazado', 'pausado')),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_en       TIMESTAMPTZ
);

-- Las bases que ya tenían la tabla con la regla rota ({3,300}): se rehace.
ALTER TABLE public.perfiles_ingeniero DROP CONSTRAINT IF EXISTS perfiles_ingeniero_portafolio_url_check;
ALTER TABLE public.perfiles_ingeniero ADD CONSTRAINT perfiles_ingeniero_portafolio_url_check
  CHECK (portafolio_url IS NULL OR (portafolio_url ~* '^https?://[^[:space:]<>"]{3,}$' AND char_length(portafolio_url) <= 308));

ALTER TABLE public.perfiles_ingeniero ENABLE ROW LEVEL SECURITY;

-- Cada uno ve el suyo; el administrador, todos. Nadie escribe directamente:
-- solo guardar_perfil_ingeniero y revisar_ingeniero.
DROP POLICY IF EXISTS "perfil ingeniero: el suyo o el admin" ON public.perfiles_ingeniero;
CREATE POLICY "perfil ingeniero: el suyo o el admin"
  ON public.perfiles_ingeniero FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.es_admin());

-- Crea o actualiza el perfil de quien llama. Una solicitud nueva (o una que
-- se rechazó) queda pendiente; quien ya es ingeniero queda aprobado.
CREATE OR REPLACE FUNCTION public.guardar_perfil_ingeniero(
  p_nombre TEXT,
  p_titular TEXT,
  p_bio TEXT,
  p_especialidades TEXT[],
  p_anios INTEGER,
  p_ciudad TEXT,
  p_portafolio TEXT,
  p_foto TEXT,
  p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_estado  TEXT;
BEGIN
  IF v_usuario IS NULL OR public.es_anonimo() THEN
    RAISE EXCEPTION 'Hace falta una cuenta para postular' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.perfiles_ingeniero AS pi (
    user_id, nombre, titular, bio, especialidades, anios_experiencia, ciudad, portafolio_url, foto_url, whatsapp, estado
  )
  VALUES (
    v_usuario, btrim(p_nombre), btrim(p_titular), btrim(COALESCE(p_bio, '')), COALESCE(p_especialidades, '{}'),
    p_anios, NULLIF(btrim(COALESCE(p_ciudad, '')), ''), NULLIF(btrim(COALESCE(p_portafolio, '')), ''),
    NULLIF(btrim(COALESCE(p_foto, '')), ''), NULLIF(btrim(COALESCE(p_whatsapp, '')), ''),
    CASE WHEN public.es_ingeniero() THEN 'aprobado' ELSE 'pendiente' END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    titular = EXCLUDED.titular,
    bio = EXCLUDED.bio,
    especialidades = EXCLUDED.especialidades,
    anios_experiencia = EXCLUDED.anios_experiencia,
    ciudad = EXCLUDED.ciudad,
    portafolio_url = EXCLUDED.portafolio_url,
    foto_url = EXCLUDED.foto_url,
    whatsapp = EXCLUDED.whatsapp,
    estado = CASE WHEN pi.estado = 'rechazado' THEN 'pendiente' ELSE pi.estado END,
    actualizado_en = now()
  RETURNING estado INTO v_estado;

  RETURN jsonb_build_object('estado', v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_perfil_ingeniero(TEXT, TEXT, TEXT, TEXT[], INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_perfil_ingeniero(TEXT, TEXT, TEXT, TEXT[], INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Para el administrador: todas las solicitudes y los ingenieros, con su
-- correo y cómo les va.
CREATE OR REPLACE FUNCTION public.ingenieros_para_admin()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador revisa ingenieros' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', pi.user_id,
      'correo', u.email,
      'nombre', pi.nombre,
      'titular', pi.titular,
      'bio', pi.bio,
      'especialidades', to_jsonb(pi.especialidades),
      'anios_experiencia', pi.anios_experiencia,
      'ciudad', pi.ciudad,
      'portafolio_url', pi.portafolio_url,
      'foto_url', pi.foto_url,
      'whatsapp', pi.whatsapp,
      'estado', pi.estado,
      'es_admin', COALESCE(pf.es_admin, false),
      'creado_en', pi.creado_en,
      'encargos', (SELECT count(*) FROM public.proyectos p WHERE p.ingeniero_id = pi.user_id AND p.payload->>'aceptado' = 'true'),
      'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
      'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id)
    ) ORDER BY (pi.estado = 'pendiente') DESC, pi.creado_en), '[]'::jsonb)
    FROM public.perfiles_ingeniero pi
    JOIN auth.users u ON u.id = pi.user_id
    LEFT JOIN public.perfiles pf ON pf.user_id = pi.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingenieros_para_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingenieros_para_admin() TO authenticated;

-- 'aprobar' (pendiente → aprobado, y pasa a ser ingeniero), 'rechazar'
-- (pendiente → rechazado), 'pausar' (deja de salir a los clientes nuevos; sus
-- encargos siguen siendo suyos) y 'reactivar'. El administrador no se toca a sí
-- mismo.
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

REVOKE ALL ON FUNCTION public.revisar_ingeniero(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_ingeniero(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Cada encargo, con su ingeniero
-- ----------------------------------------------------------------------------
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS ingeniero_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS proyectos_ingeniero_idx ON public.proyectos (ingeniero_id);

-- El ingeniero solo se pone con elegir_ingeniero / reasignar_encargo (que
-- marcan aib.asignando). Si el encargo se acepta sin elegir, se le pone el de
-- su invitación o, si no tiene, el administrador.
CREATE OR REPLACE FUNCTION public.proteger_ingeniero_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(current_setting('aib.asignando', true), '') <> 'si' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ingeniero_id := NULL;
    ELSIF NEW.ingeniero_id IS DISTINCT FROM OLD.ingeniero_id THEN
      RAISE EXCEPTION 'El ingeniero de un encargo no se cambia así' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.payload->>'aceptado' = 'true' AND NEW.ingeniero_id IS NULL THEN
    NEW.ingeniero_id := COALESCE(
      (SELECT i.ingeniero_id FROM public.invitaciones i
       WHERE i.cliente_id = NEW.user_id AND i.origen = 'ingeniero' LIMIT 1),
      (SELECT pf.user_id FROM public.perfiles pf WHERE pf.es_admin ORDER BY pf.created_at LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_ingeniero_asignado ON public.proyectos;
CREATE TRIGGER proteger_ingeniero_asignado
  BEFORE INSERT OR UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_ingeniero_asignado();

-- Los encargos que ya estaban aceptados: el de su invitación o el administrador.
SELECT set_config('aib.asignando', 'si', true);
UPDATE public.proyectos p
SET ingeniero_id = COALESCE(
  (SELECT i.ingeniero_id FROM public.invitaciones i WHERE i.cliente_id = p.user_id AND i.origen = 'ingeniero' LIMIT 1),
  (SELECT pf.user_id FROM public.perfiles pf WHERE pf.es_admin ORDER BY pf.created_at LIMIT 1)
)
WHERE p.payload->>'aceptado' = 'true' AND p.ingeniero_id IS NULL;
SELECT set_config('aib.asignando', '', true);

-- El cliente elige ingeniero antes de aceptar. Devuelve {estado}: 'ok',
-- 'propio' (llegó con la invitación de un ingeniero: es ese), 'no_disponible'
-- o 'no_existe'.
CREATE OR REPLACE FUNCTION public.elegir_ingeniero(p_proyecto UUID, p_ingeniero UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proyectos
    WHERE id = p_proyecto AND user_id = auth.uid() AND payload->>'aceptado' IS DISTINCT FROM 'true'
  ) THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = auth.uid() AND origen = 'ingeniero') THEN
    RETURN jsonb_build_object('estado', 'propio');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfiles_ingeniero pi
    JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
    WHERE pi.user_id = p_ingeniero AND pi.estado = 'aprobado'
  ) OR p_ingeniero = auth.uid() THEN
    RETURN jsonb_build_object('estado', 'no_disponible');
  END IF;

  PERFORM set_config('aib.asignando', 'si', true);
  UPDATE public.proyectos SET ingeniero_id = p_ingeniero WHERE id = p_proyecto;
  PERFORM set_config('aib.asignando', '', true);
  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.elegir_ingeniero(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elegir_ingeniero(UUID, UUID) TO authenticated;

-- El administrador puede pasar un encargo a otro ingeniero (o a sí mismo).
CREATE OR REPLACE FUNCTION public.reasignar_encargo(p_proyecto UUID, p_ingeniero UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador reasigna encargos' USING ERRCODE = '42501';
  END IF;
  IF NOT public.es_ingeniero_id(p_ingeniero) THEN
    RETURN false;
  END IF;

  PERFORM set_config('aib.asignando', 'si', true);
  UPDATE public.proyectos SET ingeniero_id = p_ingeniero
  WHERE id = p_proyecto AND payload->>'aceptado' = 'true';
  PERFORM set_config('aib.asignando', '', true);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reasignar_encargo(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reasignar_encargo(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Reseñas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resenas (
  proyecto_id  UUID PRIMARY KEY REFERENCES public.proyectos(id) ON DELETE CASCADE,
  ingeniero_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estrellas    SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario   TEXT NOT NULL DEFAULT '' CHECK (char_length(comentario) <= 600),
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resenas_ingeniero_idx ON public.resenas (ingeniero_id, creada_en DESC);

ALTER TABLE public.resenas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resenas: el cliente, su ingeniero y el admin" ON public.resenas;
CREATE POLICY "resenas: el cliente, su ingeniero y el admin"
  ON public.resenas FOR SELECT TO authenticated
  USING (cliente_id = (SELECT auth.uid()) OR ingeniero_id = (SELECT auth.uid()) OR public.es_admin());

-- Solo el dueño del encargo, una vez, y solo cuando su web ya está publicada.
-- Devuelve {estado}: 'ok', 'ya_existe', 'no_publicada' o 'no_existe'.
CREATE OR REPLACE FUNCTION public.dejar_resena(p_proyecto UUID, p_estrellas INTEGER, p_comentario TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ingeniero UUID;
BEGIN
  SELECT ingeniero_id INTO v_ingeniero FROM public.proyectos
  WHERE id = p_proyecto AND user_id = auth.uid() AND payload->>'aceptado' = 'true';
  IF v_ingeniero IS NULL OR v_ingeniero = auth.uid() THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  IF COALESCE((
    SELECT estado FROM public.seguimiento_encargos
    WHERE proyecto_id = p_proyecto ORDER BY created_at DESC, id DESC LIMIT 1
  ), 'recibido') <> 'publicada' THEN
    RETURN jsonb_build_object('estado', 'no_publicada');
  END IF;

  IF p_estrellas IS NULL OR p_estrellas NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Elige de 1 a 5 estrellas' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.resenas (proyecto_id, ingeniero_id, cliente_id, estrellas, comentario)
  VALUES (p_proyecto, v_ingeniero, auth.uid(), p_estrellas, left(btrim(COALESCE(p_comentario, '')), 600))
  ON CONFLICT (proyecto_id) DO NOTHING;

  RETURN jsonb_build_object('estado', CASE WHEN FOUND THEN 'ok' ELSE 'ya_existe' END);
END;
$$;

REVOKE ALL ON FUNCTION public.dejar_resena(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dejar_resena(UUID, INTEGER, TEXT) TO authenticated;

-- Los ingenieros que el cliente puede elegir (y que salen en la portada), con
-- sus estrellas y sus últimas reseñas. Sin contacto: ni WhatsApp ni correo.
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

-- El ingeniero de un encargo, para que su cliente lo vea en el seguimiento.
CREATE OR REPLACE FUNCTION public.mi_ingeniero(p_proyecto UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'nombre', COALESCE(pi.nombre, 'Tu ingeniero'),
    'titular', pi.titular,
    'foto_url', pi.foto_url,
    'resena', (SELECT jsonb_build_object('estrellas', r.estrellas, 'comentario', r.comentario)
               FROM public.resenas r WHERE r.proyecto_id = p.id)
  )
  FROM public.proyectos p
  LEFT JOIN public.perfiles_ingeniero pi ON pi.user_id = p.ingeniero_id
  WHERE p.id = p_proyecto AND p.user_id = auth.uid() AND p.ingeniero_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.mi_ingeniero(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_ingeniero(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Cada ingeniero ve lo suyo; el administrador, todo
-- ----------------------------------------------------------------------------
-- Proyectos: los que le eligieron y los de los clientes de sus invitaciones.
DROP POLICY IF EXISTS "El ingeniero ve todos los proyectos" ON public.proyectos;
DROP POLICY IF EXISTS "El ingeniero ve los proyectos de sus clientes" ON public.proyectos;
CREATE POLICY "El ingeniero ve los proyectos de sus clientes"
  ON public.proyectos FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_ingeniero()
      AND (
        ingeniero_id = (SELECT auth.uid())
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
        AND (p.user_id = (SELECT auth.uid()) OR p.ingeniero_id = (SELECT auth.uid()))
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
        AND (p.ingeniero_id = (SELECT auth.uid()) OR public.es_admin())
    )
  );

-- Comentarios: los de los proyectos que puede ver (las políticas de
-- proyectos se aplican dentro del EXISTS).
DROP POLICY IF EXISTS "comentarios: el ingeniero los lee" ON public.comentarios;
CREATE POLICY "comentarios: el ingeniero los lee"
  ON public.comentarios FOR SELECT TO authenticated
  USING (
    public.es_admin()
    OR (public.es_ingeniero() AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = comentarios.proyecto_id))
  );

DROP POLICY IF EXISTS "invitaciones: el ingeniero ve las suyas" ON public.invitaciones;
CREATE POLICY "invitaciones: el ingeniero ve las suyas"
  ON public.invitaciones FOR SELECT TO authenticated
  USING (public.es_ingeniero() AND (ingeniero_id = (SELECT auth.uid()) OR public.es_admin()));

-- El catálogo que ven los clientes es el del administrador: si cada ingeniero
-- activara las mismas plantillas, al cliente le saldrían repetidas.
DROP POLICY IF EXISTS "Las plantillas activas se pueden ver" ON public.plantillas;
CREATE POLICY "Las plantillas activas se pueden ver"
  ON public.plantillas FOR SELECT TO authenticated
  USING (activa AND public.es_admin_id(ingeniero_id));

CREATE OR REPLACE FUNCTION public.cambiar_invitacion(p_id UUID, p_activa BOOLEAN, p_es_prueba BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero cambia invitaciones' USING ERRCODE = '42501';
  END IF;

  UPDATE public.invitaciones
  SET activa = COALESCE(p_activa, activa),
      es_prueba = COALESCE(p_es_prueba, es_prueba)
  WHERE id = p_id AND (ingeniero_id = auth.uid() OR public.es_admin());

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_invitacion(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv         public.invitaciones%ROWTYPE;
  v_borrados    INTEGER := 0;
  v_conservados INTEGER := 0;
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero elimina invitaciones' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones
  WHERE id = p_id AND (ingeniero_id = auth.uid() OR public.es_admin())
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  IF v_inv.cliente_id IS NOT NULL THEN
    DELETE FROM public.comentarios c
    USING public.proyectos p
    WHERE c.proyecto_id = p.id
      AND p.user_id = v_inv.cliente_id
      AND (v_inv.es_prueba OR p.payload->>'aceptado' IS DISTINCT FROM 'true');

    DELETE FROM public.proyectos
    WHERE user_id = v_inv.cliente_id
      AND (v_inv.es_prueba OR payload->>'aceptado' IS DISTINCT FROM 'true');
    GET DIAGNOSTICS v_borrados = ROW_COUNT;

    SELECT count(*) INTO v_conservados FROM public.proyectos WHERE user_id = v_inv.cliente_id;
  END IF;

  DELETE FROM public.invitaciones WHERE id = v_inv.id;

  RETURN jsonb_build_object('estado', 'ok', 'borrados', v_borrados, 'conservados', v_conservados);
END;
$$;

-- La documentación la adjunta el ingeniero del encargo (o el administrador).
CREATE OR REPLACE FUNCTION public.adjuntar_documentacion(p_proyecto UUID, p_documentacion JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  filas INTEGER;
BEGIN
  IF NOT public.es_ingeniero() OR jsonb_typeof(p_documentacion) IS DISTINCT FROM 'object' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.proyectos
  SET payload = jsonb_set(payload, '{documentacion}', p_documentacion)
  WHERE id = p_proyecto
    AND payload->>'aceptado' = 'true'
    AND COALESCE(jsonb_typeof(payload->'documentacion'), 'null') = 'null'
    AND (ingeniero_id = auth.uid() OR public.es_admin());

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Métricas globales: solo el administrador
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.embudo_cliente()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador ve el embudo' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'desde', (SELECT min(empezado_en) FROM public.progreso_cuestionario),
    'intentos', (SELECT count(*) FROM public.progreso_cuestionario WHERE NOT es_prueba),
    'por_orden', (
      SELECT COALESCE(jsonb_object_agg(orden, n), '{}'::jsonb) FROM (
        SELECT orden, count(*) AS n FROM public.progreso_cuestionario WHERE NOT es_prueba GROUP BY orden
      ) x
    ),
    'enlaces', (
      SELECT jsonb_build_object(
        'creados', count(*),
        'abiertos', count(*) FILTER (WHERE e.aperturas > 0),
        'aperturas', COALESCE(sum(e.aperturas), 0),
        'lista', COALESCE(
          jsonb_agg(
            jsonb_build_object('negocio', e.empresa, 'aperturas', e.aperturas, 'ultima', e.ultima_apertura)
            ORDER BY e.aperturas DESC, e.created_at DESC
          ) FILTER (WHERE e.aperturas > 0),
          '[]'::jsonb
        )
      )
      FROM (
        SELECT ec.aperturas, ec.ultima_apertura, ec.created_at, p.payload->'ficha'->>'empresa' AS empresa
        FROM public.enlaces_compartidos ec
        JOIN public.proyectos p ON p.id = ec.proyecto_id
        WHERE NOT EXISTS (SELECT 1 FROM public.perfiles pf WHERE pf.user_id = ec.user_id AND pf.rol = 'ingeniero')
          AND NOT EXISTS (SELECT 1 FROM public.invitaciones i WHERE i.cliente_id = ec.user_id AND i.es_prueba)
      ) e
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.configurar_prueba_precio(p_activa BOOLEAN, p_precios INTEGER[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_precios INTEGER[];
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador configura la prueba de precio' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador ve la prueba de precio' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.embudo_portada()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador ve el embudo de la portada' USING ERRCODE = '42501';
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
      'vieron_maqueta', (
        SELECT count(DISTINCT user_id) FROM public.progreso_cuestionario WHERE orden >= 8 AND NOT es_prueba
      )
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Encargos con su ingeniero
-- ----------------------------------------------------------------------------
-- La misma vista de supabase_panel_ingeniero.sql, con dos columnas más al
-- final (ingeniero_id e ingeniero). es_prueba usa es_ingeniero_id: con varios
-- ingenieros, el administrador debe reconocer también las pruebas de los demás.
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
  (SELECT pi.nombre FROM public.perfiles_ingeniero pi WHERE pi.user_id = p.ingeniero_id) AS ingeniero
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
