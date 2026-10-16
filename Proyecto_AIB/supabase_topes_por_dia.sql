-- ============================================================================
-- AIB+ · Topes de IA para días especiales
-- ============================================================================
-- Un evento (CodeOn, el sábado 17 de octubre de 2026) trae mucha gente de
-- golpe: el tope de pruebas libres (10 al día) y el de gasto global en IA
-- (US$10 al día) se quedarían cortos. Aquí se fijan topes para fechas
-- concretas (hora de Lima); el resto de días valen los de limites_ia. Pasada
-- la fecha, todo vuelve solo a lo normal: no hay que acordarse de bajarlos.
--
-- Cambia hay_cupo_prueba_libre (supabase_invitaciones.sql) y
-- reservar_cuota_ia (supabase_plan_pro.sql) con reemplazos exactos: cada
-- texto se comprueba antes de cambiarlo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.limites_ia_dias (
  dia                DATE PRIMARY KEY,
  -- NULL: ese día vale el de limites_ia.
  pruebas_libres_dia INTEGER CHECK (pruebas_libres_dia IS NULL OR pruebas_libres_dia >= 0),
  global_centimos    INTEGER CHECK (global_centimos IS NULL OR global_centimos > 0),
  motivo             TEXT
);

-- Solo la leen las funciones de abajo (SECURITY DEFINER); se cambia desde el SQL.
ALTER TABLE public.limites_ia_dias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.limites_ia_dias FROM anon, authenticated;

/** Pruebas libres de hoy (Lima): las del día especial o las de siempre. */
CREATE OR REPLACE FUNCTION public.pruebas_libres_hoy()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT d.pruebas_libres_dia FROM public.limites_ia_dias d WHERE d.dia = (now() AT TIME ZONE 'America/Lima')::date),
    (SELECT l.pruebas_libres_dia FROM public.limites_ia l WHERE l.id),
    0
  );
$$;

/** Tope global de gasto en IA de hoy (Lima), en céntimos de dólar. */
CREATE OR REPLACE FUNCTION public.global_centimos_hoy()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT d.global_centimos FROM public.limites_ia_dias d WHERE d.dia = (now() AT TIME ZONE 'America/Lima')::date),
    (SELECT l.global_centimos FROM public.limites_ia l WHERE l.id),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.pruebas_libres_hoy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.global_centimos_hoy() FROM PUBLIC, anon, authenticated;

-- Las dos funciones que leían los topes fijos ahora leen los de hoy.
DO $$
DECLARE
  def TEXT;
  viejo TEXT;
BEGIN
  def := pg_get_functiondef('public.hay_cupo_prueba_libre()'::regprocedure);
  viejo := 'COALESCE((SELECT pruebas_libres_dia FROM public.limites_ia WHERE id), 0)';
  IF array_length(string_to_array(def, viejo), 1) <> 2 THEN
    RAISE EXCEPTION 'hay_cupo_prueba_libre: el texto a reemplazar no aparece una sola vez';
  END IF;
  EXECUTE replace(def, viejo, 'public.pruebas_libres_hoy()');

  def := pg_get_functiondef('public.reservar_cuota_ia(text)'::regprocedure);
  viejo := 'IF gastado_global + coste > limites.global_centimos THEN';
  IF array_length(string_to_array(def, viejo), 1) <> 2 THEN
    RAISE EXCEPTION 'reservar_cuota_ia: el texto a reemplazar no aparece una sola vez';
  END IF;
  EXECUTE replace(def, viejo, 'IF gastado_global + coste > public.global_centimos_hoy() THEN');
END $$;

-- CodeOn: el sábado, 300 pruebas libres y US$40 de IA; el domingo, 100
-- pruebas con el gasto de siempre (US$10), para no pasar del saldo de la API
-- (unos US$50). El lunes 19 vuelven los de limites_ia.
INSERT INTO public.limites_ia_dias (dia, pruebas_libres_dia, global_centimos, motivo) VALUES
  ('2026-10-17', 300, 4000, 'CodeOn (unos 500 devs)'),
  ('2026-10-18', 100, 1000, 'Día siguiente a CodeOn (US$10: el saldo es de unos US$50)')
ON CONFLICT (dia) DO UPDATE
  SET pruebas_libres_dia = EXCLUDED.pruebas_libres_dia,
      global_centimos = EXCLUDED.global_centimos,
      motivo = EXCLUDED.motivo;
