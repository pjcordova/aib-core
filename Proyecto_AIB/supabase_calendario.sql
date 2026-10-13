-- ============================================================================
-- AIB+ — Google Calendar de cada ingeniero, para ABI
-- ============================================================================
-- El ingeniero conecta su Google Calendar desde los ajustes de ABI. Google le
-- da al servidor un permiso de larga duración (refresh token) para ver su
-- disponibilidad y crear las reuniones que él confirme. Ese permiso se guarda
-- cifrado en Supabase Vault: la tabla solo dice si está conectado y con qué
-- cuenta. Solo el servidor lo lee, con su clave (clave_servidor_valida, la
-- misma del resumen diario), y solo para el ingeniero que lo pidió.
--
-- Ejecutar después de supabase_panel_ingeniero.sql (claves_sistema y
-- clave_servidor_valida) y supabase_marketplace.sql (es_ingeniero_id).
-- Se puede ejecutar más de una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendarios_ingeniero (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- La cuenta de Google que conectó, para mostrársela.
  correo       TEXT,
  -- El refresh token, en vault.secrets.
  secreto_id   UUID NOT NULL,
  conectado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendarios_ingeniero ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendarios_ingeniero FROM anon, authenticated;
GRANT SELECT (user_id, correo, conectado_en) ON public.calendarios_ingeniero TO authenticated;

DROP POLICY IF EXISTS "Cada ingeniero ve su calendario" ON public.calendarios_ingeniero;
CREATE POLICY "Cada ingeniero ve su calendario"
  ON public.calendarios_ingeniero FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- El servidor guarda (o renueva) el permiso al volver de Google.
CREATE OR REPLACE FUNCTION public.guardar_calendario(p_clave TEXT, p_usuario UUID, p_correo TEXT, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secreto UUID;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RAISE EXCEPTION 'Clave no válida' USING ERRCODE = '42501';
  END IF;
  IF p_usuario IS NULL OR NOT public.es_ingeniero_id(p_usuario)
     OR p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 2000 THEN
    RETURN false;
  END IF;

  SELECT secreto_id INTO v_secreto FROM public.calendarios_ingeniero WHERE user_id = p_usuario FOR UPDATE;
  IF v_secreto IS NULL THEN
    v_secreto := vault.create_secret(p_token, NULL, 'Google Calendar de ' || p_usuario::text);
    INSERT INTO public.calendarios_ingeniero (user_id, correo, secreto_id)
    VALUES (p_usuario, left(p_correo, 200), v_secreto);
  ELSE
    PERFORM vault.update_secret(v_secreto, p_token);
    UPDATE public.calendarios_ingeniero
    SET correo = left(p_correo, 200), conectado_en = now()
    WHERE user_id = p_usuario;
  END IF;
  RETURN true;
END;
$$;

-- El permiso, para que el servidor hable con Google en nombre del ingeniero.
CREATE OR REPLACE FUNCTION public.token_calendario(p_clave TEXT, p_usuario UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RAISE EXCEPTION 'Clave no válida' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT ds.decrypted_secret
    FROM public.calendarios_ingeniero c
    JOIN vault.decrypted_secrets ds ON ds.id = c.secreto_id
    WHERE c.user_id = p_usuario
  );
END;
$$;

-- Al desconectarlo (o si Google ya no acepta el permiso), se borra todo.
CREATE OR REPLACE FUNCTION public.borrar_calendario(p_clave TEXT, p_usuario UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secreto UUID;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RAISE EXCEPTION 'Clave no válida' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.calendarios_ingeniero WHERE user_id = p_usuario RETURNING secreto_id INTO v_secreto;
  IF v_secreto IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM vault.secrets WHERE id = v_secreto;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_calendario(TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.token_calendario(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.borrar_calendario(TEXT, UUID) FROM PUBLIC;
-- El servidor llama con la clave anónima: lo que autoriza es p_clave.
GRANT EXECUTE ON FUNCTION public.guardar_calendario(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.token_calendario(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_calendario(TEXT, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- El correo del cliente para la invitación
-- ----------------------------------------------------------------------------
-- Quien acepta desde una prueba sin cuenta deja su encargo sin correo
-- (contacto.correo vacío) y guarda su cuenta con su correo después. Para la
-- invitación de la reunión, el servidor usa ese correo de su cuenta. Solo lo
-- puede pedir el ingeniero del encargo (o su equipo, o el administrador), y
-- el panel no lo muestra: va directo a Google como invitado.
CREATE OR REPLACE FUNCTION public.correo_cliente(p_proyecto UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(u.email, '')
  FROM public.proyectos p
  JOIN auth.users u ON u.id = p.user_id AND NOT COALESCE(u.is_anonymous, false)
  WHERE p.id = p_proyecto
    AND p.payload->>'aceptado' = 'true'
    AND (p.ingeniero_id = auth.uid() OR p.ingeniero_id = public.dueno_de_mi_equipo() OR public.es_admin());
$$;

REVOKE ALL ON FUNCTION public.correo_cliente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correo_cliente(UUID) TO authenticated;
