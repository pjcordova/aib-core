-- ============================================================================
-- AIB+ — El cliente guarda su proyecto con Google o con su correo
-- ============================================================================
-- El cliente prueba sin cuenta (sesión anónima, en su navegador). Al enviar su
-- encargo se le ofrece guardarlo con Google o con su correo: la sesión anónima
-- pasa a ser una cuenta normal con el MISMO usuario, así que sus proyectos,
-- su invitación y su encargo siguen siendo suyos sin mover nada. Desde otro
-- dispositivo entra con esa cuenta («Recupera tu proyecto») y lo encuentra.
--
-- Lo que hace falta aquí:
--   1. Traspaso: si ese Google o ese correo ya tenían cuenta (guardó otro
--      proyecto antes, o empezó de nuevo en otro celular), no se puede
--      convertir la sesión anónima. Entra a su cuenta y se trae lo que hizo
--      sin cuenta: la sesión anónima deja un código de un solo uso
--      (preparar_traspaso) y la cuenta lo canjea (completar_traspaso).
--   2. El enlace de invitación ya no se lleva un proyecto guardado: antes,
--      quien abría el enlace en otro navegador se quedaba con el proyecto.
--      Con el proyecto en una cuenta, hay que entrar con ella.
--
-- Ejecutar después de supabase_invitaciones.sql. Se puede ejecutar más de una vez.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Traspaso de lo hecho sin cuenta a una cuenta que ya existía
-- ----------------------------------------------------------------------------
-- Sin políticas ni permisos: solo la leen y escriben las dos funciones.
CREATE TABLE IF NOT EXISTS public.traspasos_cliente (
  token     TEXT PRIMARY KEY,
  desde     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.traspasos_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.traspasos_cliente FROM PUBLIC, anon, authenticated;

-- La sesión anónima, justo antes de entrar a una cuenta: devuelve el código
-- (o NULL si no hay nada que traer). Un código por sesión; caduca en una hora.
CREATE OR REPLACE FUNCTION public.preparar_traspaso()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_token   TEXT;
BEGIN
  IF v_usuario IS NULL OR NOT public.es_anonimo() THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.proyectos WHERE user_id = v_usuario)
     AND NOT EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario AND activa) THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.traspasos_cliente
  WHERE desde = v_usuario OR creado_en < now() - interval '1 day';

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  INSERT INTO public.traspasos_cliente (token, desde) VALUES (v_token, v_usuario);
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_traspaso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_traspaso() TO authenticated;

-- La cuenta, ya dentro: se trae lo de la sesión anónima. Devuelve 'ok',
-- 'no_existe' (código desconocido, usado o caducado), 'sin_cuenta' (quien
-- llama sigue sin cuenta) o 'no_cliente' (un ingeniero no recibe proyectos de
-- cliente).
CREATE OR REPLACE FUNCTION public.completar_traspaso(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_desde   UUID;
BEGIN
  IF v_usuario IS NULL OR public.es_anonimo() THEN
    RETURN 'sin_cuenta';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN 'no_existe';
  END IF;

  -- De un solo uso: se borra al canjearlo.
  DELETE FROM public.traspasos_cliente
  WHERE token = p_token AND creado_en > now() - interval '1 hour'
  RETURNING desde INTO v_desde;
  IF v_desde IS NULL THEN
    RETURN 'no_existe';
  END IF;
  -- La misma persona: la sesión anónima se convirtió en esta cuenta.
  IF v_desde = v_usuario THEN
    RETURN 'ok';
  END IF;
  -- Solo se trae lo de una sesión anónima.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_desde AND is_anonymous) THEN
    RETURN 'no_existe';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perfiles WHERE user_id = v_usuario AND rol <> 'cliente') THEN
    RETURN 'no_cliente';
  END IF;

  UPDATE public.proyectos SET user_id = v_usuario WHERE user_id = v_desde;
  UPDATE public.enlaces_compartidos SET user_id = v_usuario WHERE user_id = v_desde;
  UPDATE public.comentarios SET user_id = v_usuario WHERE user_id = v_desde;
  UPDATE public.progreso_cuestionario SET user_id = v_usuario WHERE user_id = v_desde;
  UPDATE public.propuestas SET cliente_id = v_usuario WHERE cliente_id = v_desde;
  UPDATE public.resenas SET cliente_id = v_usuario WHERE cliente_id = v_desde;
  UPDATE public.intereses_cliente i SET user_id = v_usuario
  WHERE i.user_id = v_desde
    AND NOT EXISTS (SELECT 1 FROM public.intereses_cliente o WHERE o.user_id = v_usuario AND o.tipo = i.tipo);
  -- Una invitación y un precio por cliente: se quedan los de la cuenta si ya tenía.
  IF NOT EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario) THEN
    UPDATE public.invitaciones SET cliente_id = v_usuario WHERE cliente_id = v_desde;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.precio_asignado WHERE user_id = v_usuario) THEN
    UPDATE public.precio_asignado SET user_id = v_usuario WHERE user_id = v_desde;
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.completar_traspaso(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_traspaso(TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Enlace de invitación con el proyecto ya guardado en una cuenta
-- ----------------------------------------------------------------------------
-- La misma de supabase_invitaciones.sql, más el estado 'guardada': si quien
-- tiene la invitación ya no es una sesión anónima, el enlace no se lleva su
-- proyecto; hay que entrar con su cuenta.
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

  IF v_inv.cliente_id IS NOT NULL AND v_inv.cliente_id <> v_usuario
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_inv.cliente_id AND NOT u.is_anonymous) THEN
    RETURN jsonb_build_object('estado', 'guardada');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitaciones WHERE cliente_id = v_usuario AND id <> v_inv.id) THEN
    RETURN jsonb_build_object('estado', 'otra');
  END IF;

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

REVOKE ALL ON FUNCTION public.reclamar_invitacion(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclamar_invitacion(TEXT) TO authenticated;
