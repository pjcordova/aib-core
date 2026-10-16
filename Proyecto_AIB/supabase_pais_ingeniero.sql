-- ============================================================================
-- AIB+ · El país de cada ingeniero (para mostrar su bandera)
-- ============================================================================
-- Ya postulan ingenieros de Argentina y pronto de México: el cliente ve la
-- bandera junto al nombre. Se guarda como código ISO de dos letras ('PE',
-- 'AR', 'MX'…); la ciudad sigue aparte, como texto libre.
--
-- 1. perfiles_ingeniero.pais, con los actuales en Perú salvo CABA (Argentina).
-- 2. guardar_perfil_ingeniero acepta p_pais (si no llega, no cambia el guardado).
-- 3. Las funciones que envían al ingeniero a la web también envían su país
--    (reemplazos exactos, comprobados uno por uno).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La columna
-- ----------------------------------------------------------------------------

ALTER TABLE public.perfiles_ingeniero
  ADD COLUMN IF NOT EXISTS pais TEXT CHECK (pais IS NULL OR pais ~ '^[A-Z]{2}$');

UPDATE public.perfiles_ingeniero
SET pais = CASE WHEN ciudad ~* '^\s*(caba|buenos aires)' THEN 'AR' ELSE 'PE' END
WHERE pais IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Guardar el perfil, ahora con el país
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.guardar_perfil_ingeniero(TEXT, TEXT, TEXT, TEXT[], INTEGER, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.guardar_perfil_ingeniero(
  p_nombre TEXT,
  p_titular TEXT,
  p_bio TEXT,
  p_especialidades TEXT[],
  p_anios INTEGER,
  p_ciudad TEXT,
  p_portafolio TEXT,
  p_foto TEXT,
  p_whatsapp TEXT,
  p_pais TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario UUID := auth.uid();
  v_estado  TEXT;
  -- Solo un código ISO de dos letras; cualquier otra cosa se ignora.
  v_pais    TEXT := CASE WHEN upper(btrim(COALESCE(p_pais, ''))) ~ '^[A-Z]{2}$' THEN upper(btrim(p_pais)) END;
BEGIN
  IF v_usuario IS NULL OR public.es_anonimo() THEN
    RAISE EXCEPTION 'Hace falta una cuenta para postular' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.perfiles_ingeniero AS pi (
    user_id, nombre, titular, bio, especialidades, anios_experiencia, ciudad, portafolio_url, foto_url, whatsapp, pais, estado
  )
  VALUES (
    v_usuario, btrim(p_nombre), btrim(p_titular), btrim(COALESCE(p_bio, '')), COALESCE(p_especialidades, '{}'),
    p_anios, NULLIF(btrim(COALESCE(p_ciudad, '')), ''), NULLIF(btrim(COALESCE(p_portafolio, '')), ''),
    NULLIF(btrim(COALESCE(p_foto, '')), ''), NULLIF(btrim(COALESCE(p_whatsapp, '')), ''), v_pais,
    CASE WHEN public.es_admin() THEN 'aprobado' ELSE 'pendiente' END
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
    pais = COALESCE(EXCLUDED.pais, pi.pais),
    estado = CASE WHEN pi.estado = 'rechazado' THEN 'pendiente' ELSE pi.estado END,
    actualizado_en = now()
  RETURNING estado INTO v_estado;

  RETURN jsonb_build_object('estado', v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_perfil_ingeniero(TEXT, TEXT, TEXT, TEXT[], INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_perfil_ingeniero(TEXT, TEXT, TEXT, TEXT[], INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. El país, junto a la foto, en lo que llega a la web
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  -- {función, texto que se busca, texto nuevo}: cada texto debe aparecer una sola vez.
  cambios TEXT[] := ARRAY[
    'public.catalogo_cliente()',      $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.ingenieros_disponibles()', $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.ingenieros_para_admin()',  $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.mi_ingeniero(uuid)',       $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.perfil_publico(text)',     $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.propuesta_por_token(text)', $a$'foto_url', pi.foto_url,$a$, $a$'foto_url', pi.foto_url, 'pais', pi.pais,$a$,
    'public.vitrina_portada()',        $a$pi.foto_url, pi.slug,$a$, $a$pi.foto_url, pi.pais, pi.slug,$a$,
    'public.vitrina_portada()',        $a$i.foto_url AS ing_foto,$a$, $a$i.foto_url AS ing_foto, i.pais AS ing_pais,$a$,
    'public.vitrina_portada()',        $a$'foto_url', d.ing_foto,$a$, $a$'foto_url', d.ing_foto, 'pais', d.ing_pais,$a$,
    'public.disenos_de_rubro(text[],text)', $a$pi.foto_url, pi.slug,$a$, $a$pi.foto_url, pi.pais, pi.slug,$a$,
    'public.disenos_de_rubro(text[],text)', $a$i.foto_url AS ing_foto,$a$, $a$i.foto_url AS ing_foto, i.pais AS ing_pais,$a$,
    'public.disenos_de_rubro(text[],text)', $a$'foto_url', e.ing_foto,$a$, $a$'foto_url', e.ing_foto, 'pais', e.ing_pais,$a$
  ];
  i INT;
  def TEXT;
BEGIN
  FOR i IN 1 .. array_length(cambios, 1) / 3 LOOP
    def := pg_get_functiondef(cambios[i * 3 - 2]::regprocedure);
    IF array_length(string_to_array(def, cambios[i * 3 - 1]), 1) <> 2 THEN
      RAISE EXCEPTION '%: «%» no aparece una sola vez', cambios[i * 3 - 2], cambios[i * 3 - 1];
    END IF;
    EXECUTE replace(def, cambios[i * 3 - 1], cambios[i * 3]);
  END LOOP;
END $$;
