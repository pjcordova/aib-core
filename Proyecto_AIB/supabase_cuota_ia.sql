-- ============================================================================
-- AIB+ — Tope diario de gasto en IA
-- ============================================================================
-- Cada llamada a la IA cuesta dinero real y el registro está abierto. Sin un
-- tope, un solo usuario pulsando "Probar otra versión" sin parar puede vaciar
-- el saldo de Anthropic (ya pasó una vez). Aquí se lleva la cuenta de lo que
-- gasta cada usuario al día y el servidor la consulta antes de llamar a la IA.
--
-- Los límites y los costes viven en la base de datos, no en el cliente: el
-- navegador puede llamar a esta función, pero solo para sumarse gasto a sí
-- mismo, y nunca más allá de su propio límite.
--
-- Cambiar los límites (en céntimos de dólar):
--   UPDATE public.limites_ia SET usuario_centimos = 150;
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Límites (una sola fila). Sin políticas: el navegador no la puede leer.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.limites_ia (
  id                 BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  usuario_centimos   INTEGER NOT NULL DEFAULT 100,   -- 1 $ por cliente y día
  ingeniero_centimos INTEGER NOT NULL DEFAULT 500,   -- 5 $ por ingeniero y día
  global_centimos    INTEGER NOT NULL DEFAULT 1000   -- 10 $ al día entre todos
);

ALTER TABLE public.limites_ia ENABLE ROW LEVEL SECURITY;

INSERT INTO public.limites_ia (id) VALUES (true) ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 2. Gasto por usuario y día (hora de Lima)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.uso_ia (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia      DATE NOT NULL,
  centimos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, dia)
);

-- Cuántas veces se le devolvió hoy lo reservado por una llamada que falló
-- (devolver_cuota_ia, en supabase_invitaciones.sql).
ALTER TABLE public.uso_ia ADD COLUMN IF NOT EXISTS devoluciones INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.uso_ia ENABLE ROW LEVEL SECURITY;

-- Cada uno puede ver su propio gasto (para enseñarle cuánto le queda).
-- No hay políticas de escritura: solo la función de abajo escribe.
DROP POLICY IF EXISTS "Cada usuario ve su gasto" ON public.uso_ia;
CREATE POLICY "Cada usuario ve su gasto"
  ON public.uso_ia FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 3. Reservar gasto antes de llamar a la IA
-- supabase_invitaciones.sql la sustituye para contar también el gasto de los
-- invitados (tope total por invitación).
-- ----------------------------------------------------------------------------
-- Devuelve 'ok', 'limite_usuario', 'limite_global', 'sin_sesion' o
-- 'tipo_desconocido'. El coste de cada acción está aquí, con margen sobre lo
-- medido: preguntas ~0,8 ¢, plantilla ~2,4 ¢, maqueta ~5 ¢, documentación
-- ~5 ¢, prototipo ~21 ¢. Si la llamada a la IA falla después, el gasto no se
-- devuelve: una función para devolver gasto se podría abusar desde el cliente.

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
    WHEN 'diseno' THEN 20  -- un diseño hecho por IA para el catálogo del ingeniero (~17 ¢)
  END;
  IF coste IS NULL THEN
    RETURN 'tipo_desconocido';
  END IF;

  SELECT * INTO limites FROM public.limites_ia WHERE id;
  limite_usuario := CASE WHEN public.es_ingeniero() THEN limites.ingeniero_centimos ELSE limites.usuario_centimos END;

  IF coste > limite_usuario THEN
    RETURN 'limite_usuario';
  END IF;

  SELECT COALESCE(sum(centimos), 0) INTO gastado_global FROM public.uso_ia WHERE dia = hoy;
  IF gastado_global + coste > limites.global_centimos THEN
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
    RETURN 'limite_usuario';
  END IF;
  RETURN 'ok';
END;
$$;

-- Supabase concede EXECUTE a `anon` por defecto, aparte de PUBLIC: se quitan ambos.
REVOKE ALL ON FUNCTION public.reservar_cuota_ia(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_cuota_ia(TEXT) TO authenticated;
