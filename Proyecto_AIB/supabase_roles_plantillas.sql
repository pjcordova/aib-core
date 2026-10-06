-- ============================================================================
-- AIB+ — Roles y catálogo de plantillas
-- ============================================================================
-- Ejecutar UNA vez en Supabase: Dashboard > SQL Editor > New query > Run.
-- Requiere haber ejecutado antes supabase_rls_setup.sql (tabla `proyectos`).
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Qué añade:
--   1. `perfiles`: distingue ingenieros de clientes.
--   2. Permiso para que el ingeniero vea los proyectos de sus clientes.
--   3. `plantillas`: el catálogo de cada ingeniero, con sus contadores.
--   4. `registrar_evento_plantilla`: para contar sin dar permiso de escritura.
--   5. `adjuntar_documentacion`: el ingeniero completa encargos sin documentación.
--
-- Mientras haya un solo ingeniero, todos los clientes usan su catálogo y él ve
-- todos los proyectos. Cuando haya varios, esto se acota con enlaces de
-- invitación que liguen cada cliente con su ingeniero.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Perfiles
-- ----------------------------------------------------------------------------
-- Cada cuenta nace como 'cliente'. Nadie puede cambiarse el rol desde la app:
-- no hay política de escritura, así que solo se cambia desde este editor.

CREATE TABLE IF NOT EXISTS public.perfiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol        TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'ingeniero')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada usuario ve su perfil" ON public.perfiles;
CREATE POLICY "Cada usuario ve su perfil"
  ON public.perfiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Perfil automático al registrarse.
CREATE OR REPLACE FUNCTION public.crear_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS al_registrarse ON auth.users;
CREATE TRIGGER al_registrarse
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil();

-- Solo es un trigger: nadie debe poder llamarla por la API. Conserva EXECUTE
-- supabase_auth_admin, que es quien inserta en auth.users al registrarse.
REVOKE ALL ON FUNCTION public.crear_perfil() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_perfil() TO supabase_auth_admin;

-- Las cuentas que ya existían también reciben su perfil.
INSERT INTO public.perfiles (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Se usa dentro de otras políticas. No necesita privilegios elevados: solo
-- mira el perfil de quien llama, y la política de `perfiles` ya le deja leer
-- el suyo. Sin sesión no hace falta: esas políticas son solo para authenticated.
CREATE OR REPLACE FUNCTION public.es_ingeniero()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE user_id = auth.uid() AND rol = 'ingeniero'
  );
$$;

REVOKE ALL ON FUNCTION public.es_ingeniero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_ingeniero() TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. El ingeniero ve los proyectos de sus clientes
-- ----------------------------------------------------------------------------
-- Las políticas SELECT se suman: el cliente sigue viendo solo los suyos (la
-- política original) y el ingeniero, además, los de todos.

-- OJO: con varios ingenieros, supabase_marketplace.sql sustituye esta política
-- (cada ingeniero ve solo lo suyo). Ejecútalo después si vuelves a correr este archivo.
DROP POLICY IF EXISTS "El ingeniero ve todos los proyectos" ON public.proyectos;
CREATE POLICY "El ingeniero ve todos los proyectos"
  ON public.proyectos FOR SELECT
  TO authenticated
  USING (public.es_ingeniero());


-- ----------------------------------------------------------------------------
-- 3. Catálogo de plantillas
-- ----------------------------------------------------------------------------
-- El HTML de las plantillas base vive versionado en el código; aquí se guarda
-- qué plantillas tiene cada ingeniero, cómo las etiqueta, si están activas y
-- cuánto funcionan.

CREATE TABLE IF NOT EXISTS public.plantillas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingeniero_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base           TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  estilo         TEXT NOT NULL,
  etiquetas      TEXT[] NOT NULL DEFAULT '{}',
  activa         BOOLEAN NOT NULL DEFAULT true,
  veces_mostrada INTEGER NOT NULL DEFAULT 0,
  veces_elegida  INTEGER NOT NULL DEFAULT 0,
  veces_aceptada INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ingeniero_id, base)
);

CREATE INDEX IF NOT EXISTS idx_plantillas_activas ON public.plantillas (activa, categoria);

-- Precio orientativo en soles ("desde S/ X") que el cliente ve al elegir el
-- diseño. Vacío mientras el ingeniero no lo fije.
ALTER TABLE public.plantillas
  ADD COLUMN IF NOT EXISTS precio_desde INTEGER
  CHECK (precio_desde IS NULL OR (precio_desde > 0 AND precio_desde < 1000000));

ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;

-- El ingeniero hace de todo con las suyas.
DROP POLICY IF EXISTS "El ingeniero gestiona sus plantillas" ON public.plantillas;
CREATE POLICY "El ingeniero gestiona sus plantillas"
  ON public.plantillas FOR ALL
  TO authenticated
  USING (auth.uid() = ingeniero_id AND public.es_ingeniero())
  WITH CHECK (auth.uid() = ingeniero_id AND public.es_ingeniero());

-- Cualquier usuario con sesión puede leer las activas: el cliente las necesita
-- para que AIB+ le proponga una. No puede modificarlas.
DROP POLICY IF EXISTS "Las plantillas activas se pueden ver" ON public.plantillas;
CREATE POLICY "Las plantillas activas se pueden ver"
  ON public.plantillas FOR SELECT
  TO authenticated
  USING (activa);

-- Reutiliza la función de supabase_rls_setup.sql. Va calificada: Supabase
-- tiene otra con el mismo nombre en el esquema `storage`.
DROP TRIGGER IF EXISTS set_updated_at_plantillas ON public.plantillas;
CREATE TRIGGER set_updated_at_plantillas
  BEFORE UPDATE ON public.plantillas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 4. Contadores
-- ----------------------------------------------------------------------------
-- El cliente no puede escribir en `plantillas`, pero sus elecciones son justo
-- lo que alimenta los contadores. Esta función incrementa uno concreto y nada
-- más: es la única puerta de escritura que tiene el cliente.

CREATE OR REPLACE FUNCTION public.registrar_evento_plantilla(p_plantilla UUID, p_evento TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_evento = 'mostrada' THEN
    UPDATE public.plantillas SET veces_mostrada = veces_mostrada + 1 WHERE id = p_plantilla AND activa;
  ELSIF p_evento = 'elegida' THEN
    UPDATE public.plantillas SET veces_elegida = veces_elegida + 1 WHERE id = p_plantilla AND activa;
  ELSIF p_evento = 'aceptada' THEN
    UPDATE public.plantillas SET veces_aceptada = veces_aceptada + 1 WHERE id = p_plantilla;
  END IF;
END;
$$;

-- Supabase concede EXECUTE a `anon` por defecto, aparte de PUBLIC: se quitan ambos.
REVOKE ALL ON FUNCTION public.registrar_evento_plantilla(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_plantilla(UUID, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Documentación pendiente
-- ----------------------------------------------------------------------------
-- Al aceptar, la documentación se genera en segundo plano en el navegador del
-- cliente. Si cierra la página antes, el encargo queda sin ella y el ingeniero
-- la genera desde su panel. El ingeniero no puede escribir en `proyectos`:
-- esta función solo rellena la documentación de un encargo aceptado que aún
-- no la tiene, y no toca nada más.

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
    AND COALESCE(jsonb_typeof(payload->'documentacion'), 'null') = 'null';

  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.adjuntar_documentacion(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjuntar_documentacion(UUID, JSONB) TO authenticated;


-- ============================================================================
-- ÚLTIMO PASO (manual): convertir tu cuenta en ingeniero
-- ============================================================================
-- Sustituye el correo y ejecuta solo esta línea:
--
--   UPDATE public.perfiles SET rol = 'ingeniero'
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'tu-correo@ejemplo.com');
--
-- Comprobación:
--   SELECT u.email, p.rol FROM public.perfiles p JOIN auth.users u ON u.id = p.user_id;
-- ============================================================================
