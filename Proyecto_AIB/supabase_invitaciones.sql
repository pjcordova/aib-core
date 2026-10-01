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
CREATE OR REPLACE FUNCTION public.mi_invitacion()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('negocio', negocio, 'activa', activa)
  FROM public.invitaciones
  WHERE cliente_id = auth.uid();
$$;

-- El cliente pasó la primera pregunta: para el embudo del ingeniero.
CREATE OR REPLACE FUNCTION public.registrar_inicio_invitacion()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.invitaciones
  SET empezada_en = COALESCE(empezada_en, now())
  WHERE cliente_id = auth.uid() AND activa;
$$;

REVOKE ALL ON FUNCTION public.reclamar_invitacion(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mi_invitacion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_inicio_invitacion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclamar_invitacion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_invitacion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_inicio_invitacion() TO authenticated;

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
     WHERE p.user_id = i.cliente_id AND p.payload->>'aceptado' = 'true') AS aceptada_en
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
