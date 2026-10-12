-- ============================================================================
-- AIB+ — Avisos por correo al cliente cuando avanza su encargo
-- ============================================================================
-- Cada etapa nueva de un encargo (seguimiento_encargos: recibido, en revisión,
-- propuesta enviada, en desarrollo, publicada) deja una fila en una bandeja de
-- salida. El servidor la recoge con su clave (avisos_cliente_pendientes) y
-- le escribe al cliente desde contacto@aibplus.app (Resend).
--
-- Solo reciben correo los clientes con cuenta (guardaron su proyecto con
-- Google o con su correo). Si lo guardan poco después, el aviso pendiente
-- les llega igual; pasados 3 días sin cuenta, se descarta. Por encargo se
-- envía solo la novedad más reciente: si se juntan varias, no se le llena el
-- correo. Y el mismo aviso no se repite en 10 minutos.
--
-- También las entregas de una propuesta por etapas (estado 'entrega', con el
-- nombre del hito en nota; supabase_entregas.sql).
--
-- Pasan por aquí todas las etapas, las marque el ingeniero, ABI o el propio
-- flujo (enviar_propuesta, responder_propuesta), porque el disparador está
-- en la tabla.
--
-- Ejecutar después de supabase_seguimiento.sql y supabase_propuestas.sql.
-- Se puede ejecutar más de una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.avisos_cliente (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proyecto_id UUID NOT NULL REFERENCES public.proyectos (id) ON DELETE CASCADE,
  estado      TEXT NOT NULL,
  nota        TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL mientras está pendiente.
  enviado_en  TIMESTAMPTZ,
  resultado   TEXT
);

-- 'repetido': el mismo aviso ya había salido hace unos minutos.
ALTER TABLE public.avisos_cliente DROP CONSTRAINT IF EXISTS avisos_cliente_resultado_check;
ALTER TABLE public.avisos_cliente ADD CONSTRAINT avisos_cliente_resultado_check
  CHECK (resultado IN ('enviado', 'sin_correo', 'reemplazado', 'repetido', 'fallido'));

CREATE INDEX IF NOT EXISTS avisos_cliente_pendientes_idx
  ON public.avisos_cliente (proyecto_id, id) WHERE enviado_en IS NULL;

-- Sin políticas ni permisos: solo la tocan el disparador y las funciones.
ALTER TABLE public.avisos_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_cliente FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.encolar_aviso_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.avisos_cliente (proyecto_id, estado, nota) VALUES (NEW.proyecto_id, NEW.estado, NEW.nota);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_aviso_cliente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS avisar_cliente ON public.seguimiento_encargos;
CREATE TRIGGER avisar_cliente
  AFTER INSERT ON public.seguimiento_encargos
  FOR EACH ROW EXECUTE FUNCTION public.encolar_aviso_cliente();

-- Para el servidor (con su clave): toma los avisos que ya se pueden enviar,
-- los marca como enviados y devuelve lo necesario para escribir el correo.
-- Devuelve NULL si la clave no es válida.
CREATE OR REPLACE FUNCTION public.avisos_cliente_pendientes(p_clave TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_salida JSONB := '[]'::jsonb;
  r RECORD;
BEGIN
  IF NOT public.clave_servidor_valida(p_clave) THEN
    RETURN NULL;
  END IF;

  -- Tres días y el cliente no guardó su cuenta: ya no se le avisa.
  UPDATE public.avisos_cliente
  SET enviado_en = now(), resultado = 'sin_correo'
  WHERE enviado_en IS NULL AND creado_en < now() - interval '3 days';

  -- Por encargo, solo la novedad más reciente.
  UPDATE public.avisos_cliente a
  SET enviado_en = now(), resultado = 'reemplazado'
  WHERE a.enviado_en IS NULL
    AND EXISTS (
      SELECT 1 FROM public.avisos_cliente b
      WHERE b.proyecto_id = a.proyecto_id AND b.enviado_en IS NULL AND b.id > a.id
    );

  -- El mismo aviso ya salió hace poco (por ejemplo, el ingeniero envió la
  -- propuesta y además marcó la etapa a mano): no se repite. Sí salen las
  -- entregas, que cada una es nueva, y lo que llegue después de una nueva
  -- versión de la propuesta.
  UPDATE public.avisos_cliente a
  SET enviado_en = now(), resultado = 'repetido'
  WHERE a.enviado_en IS NULL
    AND a.estado <> 'entrega'
    AND EXISTS (
      SELECT 1 FROM public.avisos_cliente b
      WHERE b.proyecto_id = a.proyecto_id
        AND b.resultado = 'enviado'
        AND b.estado = a.estado
        AND COALESCE(b.nota, '') = COALESCE(a.nota, '')
        AND b.enviado_en > now() - interval '10 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM public.propuestas pr
          WHERE pr.proyecto_id = a.proyecto_id AND pr.creada_en > b.creado_en
        )
    );

  FOR r IN
    SELECT a.id, a.estado, a.nota, a.proyecto_id, u.email AS correo, p.payload, p.ingeniero_id, p.user_id
    FROM public.avisos_cliente a
    JOIN public.proyectos p ON p.id = a.proyecto_id
    JOIN auth.users u ON u.id = p.user_id
    WHERE a.enviado_en IS NULL
      AND NOT u.is_anonymous
      AND COALESCE(u.email, '') <> ''
    ORDER BY a.id
    LIMIT 25
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    UPDATE public.avisos_cliente SET enviado_en = now(), resultado = 'enviado' WHERE id = r.id;
    v_salida := v_salida || jsonb_build_object(
      'id', r.id,
      'correo', r.correo,
      'estado', r.estado,
      'nota', r.nota,
      'tipo_servicio', COALESCE(r.payload->>'tipo_servicio', 'web'),
      'negocio', COALESCE(
        NULLIF(btrim(r.payload->'ficha'->>'empresa'), ''),
        (SELECT NULLIF(i.negocio, 'Sin nombre todavía') FROM public.invitaciones i WHERE i.cliente_id = r.user_id)
      ),
      -- Su primer nombre, para saludarlo («Hola, Ana:»).
      'cliente', NULLIF(split_part(btrim(COALESCE(r.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
      'ingeniero', (
        SELECT NULLIF(split_part(btrim(pi.nombre), ' ', 1), '')
        FROM public.perfiles_ingeniero pi WHERE pi.user_id = r.ingeniero_id
      ),
      'propuesta', CASE WHEN r.estado IN ('propuesta_enviada', 'entrega') THEN (
        SELECT jsonb_build_object('token', pr.token, 'precio', pr.precio, 'plazo_dias', pr.plazo_dias)
        FROM public.propuestas pr
        WHERE pr.proyecto_id = r.proyecto_id
        ORDER BY pr.creada_en DESC
        LIMIT 1
      ) END
    );
  END LOOP;

  RETURN v_salida;
END;
$$;

REVOKE ALL ON FUNCTION public.avisos_cliente_pendientes(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avisos_cliente_pendientes(TEXT) TO anon, authenticated;

-- Resend no lo aceptó: queda anotado (no se reintenta, para no duplicar).
CREATE OR REPLACE FUNCTION public.aviso_cliente_fallido(p_clave TEXT, p_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.avisos_cliente SET resultado = 'fallido'
  WHERE id = p_id AND public.clave_servidor_valida(p_clave);
$$;

REVOKE ALL ON FUNCTION public.aviso_cliente_fallido(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aviso_cliente_fallido(TEXT, BIGINT) TO anon, authenticated;
