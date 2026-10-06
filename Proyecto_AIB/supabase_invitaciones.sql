-- ============================================================================
-- AIB+ — Invitaciones
-- ============================================================================
-- El ingeniero crea un enlace para cada negocio (/i/<código>) y se lo manda por
-- WhatsApp. El cliente lo abre y hace todo sin crear cuenta: la app le abre
-- una sesión anónima de Supabase y la ata a la invitación. Así se mantienen la
-- seguridad por usuario (RLS), sus proyectos y el seguimiento de su encargo, y
-- puede volver con el mismo enlace.
--
-- El enlace es la llave: si el cliente lo abre en otro dispositivo, su
-- proyecto pasa a la sesión nueva. Por eso el código es aleatorio (122 bits) y
-- el ingeniero lo puede desactivar.
--
-- Cualquiera puede abrir una sesión anónima con la clave pública, así que una
-- sesión anónima SIN invitación activa no puede crear proyectos, ni subir
-- fotos, ni gastar IA. Y el gasto de IA de cada invitación tiene un tope total.
--
-- Requiere activar "Allow anonymous sign-ins" en Supabase (Authentication →
-- Sign In / Providers). Ejecutar después de los demás scripts: sustituye
-- reservar_cuota_ia (supabase_cuota_ia.sql), la política de alta de proyectos
-- (supabase_rls_setup.sql) y la de subida de fotos (supabase_fotos.sql). Se
-- puede ejecutar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ingeniero_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  negocio       TEXT NOT NULL CHECK (char_length(btrim(negocio)) BETWEEN 1 AND 80),
  -- Las pruebas del propio ingeniero no cuentan en las métricas.
  es_prueba     BOOLEAN NOT NULL DEFAULT false,
  activa        BOOLEAN NOT NULL DEFAULT true,
  -- Sesión anónima del cliente que la abrió.
  cliente_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  abierta_en    TIMESTAMPTZ,
  empezada_en   TIMESTAMPTZ,
  ultima_visita TIMESTAMPTZ,
  -- Gasto de IA acumulado, en céntimos de dólar (tope en limites_ia).
  centimos_ia   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 'ingeniero': la creó el ingeniero para un negocio. 'portada': alguien pulsó
-- «Pruébalo gratis» en la portada; se crea sola (ver sección 8).
ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'ingeniero'
  CHECK (origen IN ('ingeniero', 'portada'));

-- Una sesión anónima pertenece a una sola invitación.
CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_cliente_unico
  ON public.invitaciones (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitaciones_ingeniero_idx
  ON public.invitaciones (ingeniero_id, created_at DESC);

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

-- El ingeniero ve las suyas. Nadie escribe directamente: solo las funciones
-- de abajo, que fijan el código y el resto de campos.
DROP POLICY IF EXISTS "invitaciones: el ingeniero ve las suyas" ON public.invitaciones;
CREATE POLICY "invitaciones: el ingeniero ve las suyas"
  ON public.invitaciones FOR SELECT TO authenticated
  USING (ingeniero_id = (SELECT auth.uid()) AND public.es_ingeniero());

-- Tope de gasto de IA por invitación, en total (no por día).
ALTER TABLE public.limites_ia ADD COLUMN IF NOT EXISTS invitado_centimos INTEGER NOT NULL DEFAULT 50;

-- ----------------------------------------------------------------------------
-- 2. Quién es quién
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_anonimo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE((auth.jwt()->>'is_anonymous')::boolean, false);
$$;

-- true si quien llama tiene una cuenta normal, o es un invitado con su
-- invitación activa. Va en las políticas de alta de proyectos y fotos.
CREATE OR REPLACE FUNCTION public.puede_crear()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT public.es_anonimo()
      OR EXISTS (
        SELECT 1 FROM public.invitaciones
        WHERE cliente_id = auth.uid() AND activa
      );
$$;

REVOKE ALL ON FUNCTION public.es_anonimo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.puede_crear() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_anonimo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_crear() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. El ingeniero crea y gestiona sus invitaciones
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_invitacion(p_negocio TEXT, p_es_prueba BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fila public.invitaciones%ROWTYPE;
BEGIN
  IF NOT public.es_ingeniero() THEN
    RAISE EXCEPTION 'Solo el ingeniero crea invitaciones' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.invitaciones (ingeniero_id, negocio, es_prueba)
  VALUES (auth.uid(), btrim(p_negocio), COALESCE(p_es_prueba, false))
  RETURNING * INTO v_fila;

  RETURN jsonb_build_object('id', v_fila.id, 'token', v_fila.token);
END;
$$;

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
  WHERE id = p_id AND ingeniero_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_invitacion(TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_invitacion(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_invitacion(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_invitacion(UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- Eliminar una invitación borra también los proyectos de su cliente, salvo
-- los encargos aceptados de una invitación real: esos siguen en «Encargos»,
-- protegidos como cualquier encargo aceptado. Los de una invitación de prueba
-- se borran con todo lo demás; para borrar un encargo real hay que marcar
-- antes la invitación como prueba, así nunca se pierde uno por un clic.
-- Enlaces, seguimiento y avisos se van en cascada con cada proyecto; los
-- comentarios se borran aquí porque su clave es SET NULL. Las fotos que el
-- cliente subió quedan en Storage: SQL no puede borrar sus archivos.
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
  WHERE id = p_id AND ingeniero_id = auth.uid()
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

REVOKE ALL ON FUNCTION public.eliminar_invitacion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_invitacion(UUID) TO authenticated;

-- ¿Existe y está activa? Se pregunta ANTES de abrir la sesión anónima: así un
-- enlace mal copiado o inventado no deja una sesión vacía en Supabase. Los
-- códigos tienen 128 bits al azar: no se pueden adivinar preguntando.
CREATE OR REPLACE FUNCTION public.invitacion_valida(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_token ~ '^[0-9a-f]{32}$'
     AND EXISTS (SELECT 1 FROM public.invitaciones WHERE token = p_token AND activa);
$$;

REVOKE ALL ON FUNCTION public.invitacion_valida(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitacion_valida(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. El cliente entra con el enlace
-- ----------------------------------------------------------------------------
-- La llama la app con la sesión anónima recién abierta. Devuelve
-- {estado, negocio}: 'ok', 'no_existe' (código inválido o desactivado),
-- 'no_anonimo' (hay una cuenta normal abierta) u 'otra' (esta sesión ya es de
-- otra invitación; la app abre una sesión nueva y reintenta).
CREATE OR REPLACE FUNCTION public.reclamar_invitacion(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_inv     public.invitaciones%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR NOT public.es_anonimo() THEN
    RETURN jsonb_build_object('estado', 'no_anonimo');
  END IF;

  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_inv FROM public.invitaciones WHERE token = p_token AND activa FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario AND id <> v_inv.id) THEN
    RETURN jsonb_build_object('estado', 'otra');
  END IF;

  -- Abierta antes en otro dispositivo: lo suyo pasa a esta sesión.
  IF v_inv.cliente_id IS NOT NULL AND v_inv.cliente_id <> v_usuario THEN
    UPDATE public.proyectos SET user_id = v_usuario WHERE user_id = v_inv.cliente_id;
    UPDATE public.enlaces_compartidos SET user_id = v_usuario WHERE user_id = v_inv.cliente_id;
  END IF;

  UPDATE public.invitaciones
  SET cliente_id = v_usuario,
      abierta_en = COALESCE(abierta_en, now()),
      ultima_visita = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('estado', 'ok', 'negocio', v_inv.negocio);
END;
$$;

-- La invitación de quien llama, para darle la bienvenida. NULL si no tiene.
-- Quien llegó desde la portada aún no dio el nombre de su negocio hasta que
-- empieza: entonces negocio va NULL.
CREATE OR REPLACE FUNCTION public.mi_invitacion()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'negocio', CASE WHEN origen = 'portada' AND empezada_en IS NULL THEN NULL ELSE negocio END,
    'activa', activa,
    'origen', origen
  )
  FROM public.invitaciones
  WHERE cliente_id = auth.uid();
$$;

-- El cliente pasó la primera pregunta: para el embudo del ingeniero. Si llegó
-- desde la portada, su invitación toma el nombre del negocio que escribió.
DROP FUNCTION IF EXISTS public.registrar_inicio_invitacion();
CREATE OR REPLACE FUNCTION public.registrar_inicio_invitacion(p_negocio TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.invitaciones
  SET empezada_en = COALESCE(empezada_en, now()),
      negocio = CASE
        WHEN origen = 'portada' AND char_length(btrim(COALESCE(p_negocio, ''))) BETWEEN 1 AND 80
          THEN btrim(p_negocio)
        ELSE negocio
      END
  WHERE cliente_id = auth.uid() AND activa;
$$;

REVOKE ALL ON FUNCTION public.reclamar_invitacion(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_invitacion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_inicio_invitacion(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclamar_invitacion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_invitacion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_inicio_invitacion(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Embudo por invitación (lo consulta el ingeniero)
-- ----------------------------------------------------------------------------
-- Con security_invoker, la vista respeta las políticas de quien la consulta:
-- el ingeniero ve sus invitaciones y, de los proyectos, lo que ya puede ver.
-- "Vio su maqueta" es su primer proyecto guardado (se guarda al enseñarla).
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
  i.origen
FROM public.invitaciones i;

GRANT SELECT ON public.invitaciones_resumen TO authenticated;
REVOKE ALL ON public.invitaciones_resumen FROM anon;

-- ----------------------------------------------------------------------------
-- 6. Las sesiones anónimas sin invitación no crean nada
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own projects" ON public.proyectos;
CREATE POLICY "Users can insert own projects"
  ON public.proyectos FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND public.puede_crear());

DROP POLICY IF EXISTS "Cada usuario sube fotos a su carpeta" ON storage.objects;
CREATE POLICY "Cada usuario sube fotos a su carpeta"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fotos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.puede_crear()
  );

-- ----------------------------------------------------------------------------
-- 7. Tope de gasto de IA, ahora también por invitación
-- ----------------------------------------------------------------------------
-- Igual que en supabase_cuota_ia.sql, más: un invitado necesita su
-- invitación activa ('sin_invitacion' si no) y no pasa del tope total de su
-- invitación.
CREATE OR REPLACE FUNCTION public.reservar_cuota_ia(p_tipo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Lima')::date;
  coste INTEGER;
  limites public.limites_ia%ROWTYPE;
  limite_usuario INTEGER;
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
  END;
  IF coste IS NULL THEN
    RETURN 'tipo_desconocido';
  END IF;

  SELECT * INTO limites FROM public.limites_ia WHERE id;
  limite_usuario := CASE WHEN public.es_ingeniero() THEN limites.ingeniero_centimos ELSE limites.usuario_centimos END;

  IF coste > limite_usuario THEN
    RETURN 'limite_usuario';
  END IF;

  -- Invitado: su invitación tiene que estar activa y con saldo. Se reserva
  -- primero aquí (atómico) y se devuelve si después no cabe en el resto.
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

  -- Atómico: dos peticiones simultáneas no pueden saltarse el límite.
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
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_cuota_ia(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_cuota_ia(TEXT) TO authenticated;

-- Devuelve lo reservado cuando la llamada a la IA falla (el servidor la llama
-- antes de responder con el error): que un fallo nuestro no le gaste el tope
-- al cliente. Pasó con la primera invitación real. Como cualquiera con sesión
-- podría llamarla sin que algo falle, tiene dos topes: como mucho 3
-- devoluciones al día y nunca más de lo que gastó ese día.
CREATE OR REPLACE FUNCTION public.devolver_cuota_ia(p_tipo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Lima')::date;
  coste INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'sin_sesion';
  END IF;

  -- Los mismos costes que reservar_cuota_ia.
  coste := CASE p_tipo
    WHEN 'preguntas' THEN 1
    WHEN 'plantilla' THEN 3
    WHEN 'preview-web' THEN 6
    WHEN 'documentacion' THEN 6
    WHEN 'prototipo' THEN 25
    WHEN 'abi' THEN 5
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

  IF public.es_anonimo() THEN
    UPDATE public.invitaciones
    SET centimos_ia = GREATEST(centimos_ia - coste, 0)
    WHERE cliente_id = auth.uid() AND activa;
  END IF;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.devolver_cuota_ia(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_cuota_ia(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Probar sin cuenta desde la portada
-- ----------------------------------------------------------------------------
-- «Pruébalo gratis» en la portada abre una sesión anónima y crea para ella una
-- invitación con origen 'portada', ya abierta. Así hereda todo lo de arriba:
-- puede crear su proyecto, subir fotos y gastar IA hasta el tope de una
-- invitación, y el ingeniero la ve en su panel. El nombre del negocio llega al
-- pasar la primera pregunta (registrar_inicio_invitacion).
--
-- Como cualquiera puede abrir sesiones anónimas, hay un máximo de pruebas por
-- día (hora de Lima) en limites_ia.pruebas_libres_dia. Encima sigue el tope
-- global de gasto diario de IA.
ALTER TABLE public.limites_ia ADD COLUMN IF NOT EXISTS pruebas_libres_dia INTEGER NOT NULL DEFAULT 10
  CHECK (pruebas_libres_dia >= 0);

-- Se pregunta ANTES de abrir la sesión anónima, para no dejar sesiones vacías
-- cuando ya no quedan pruebas por hoy.
CREATE OR REPLACE FUNCTION public.hay_cupo_prueba_libre()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.perfiles WHERE rol = 'ingeniero')
     AND (
       SELECT count(*) FROM public.invitaciones
       WHERE origen = 'portada'
         AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima')
     ) < COALESCE((SELECT pruebas_libres_dia FROM public.limites_ia WHERE id), 0);
$$;

REVOKE ALL ON FUNCTION public.hay_cupo_prueba_libre() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hay_cupo_prueba_libre() TO anon, authenticated;

-- Por qué canal llegó (el ?c= del enlace: instagram, maps…), para medir
-- qué canal trae clientes. NULL si llegó sin canal.
ALTER TABLE public.invitaciones ADD COLUMN IF NOT EXISTS canal TEXT
  CHECK (canal IS NULL OR canal ~ '^[a-z0-9_-]{1,30}$');

-- Devuelve {estado}: 'ok' (también si esta sesión ya tenía su invitación),
-- 'lleno' (no quedan pruebas por hoy) o 'no_anonimo'.
DROP FUNCTION IF EXISTS public.empezar_prueba_libre();
CREATE OR REPLACE FUNCTION public.empezar_prueba_libre(p_canal TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario   UUID := auth.uid();
  v_ingeniero UUID;
  v_canal     TEXT := lower(btrim(COALESCE(p_canal, '')));
BEGIN
  IF v_canal !~ '^[a-z0-9_-]{1,30}$' THEN
    v_canal := NULL;
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

  INSERT INTO public.invitaciones (ingeniero_id, negocio, origen, cliente_id, abierta_en, ultima_visita, canal)
  VALUES (v_ingeniero, 'Sin nombre todavía', 'portada', v_usuario, now(), now(), v_canal);

  RETURN jsonb_build_object('estado', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.empezar_prueba_libre(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empezar_prueba_libre(TEXT) TO authenticated;
