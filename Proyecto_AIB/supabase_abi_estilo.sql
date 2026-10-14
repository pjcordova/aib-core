-- ============================================================================
-- AIB+ · ABI aprende tu estilo
-- ============================================================================
-- 1. Su estilo con los clientes, en los ajustes de ABI: trato (tú o usted),
--    tono, largo, emojis y firma. NULL = ABI usa lo de siempre (cercano y
--    profesional, corto).
-- 2. Sus correcciones: cuando edita un borrador de WhatsApp de ABI antes de
--    enviarlo, se guarda el borrador y cómo lo dejó. Solo las últimas 5, solo
--    las ve él y las puede borrar. ABI las lee para escribir como él y, si ve
--    que siempre corrige lo mismo, le propone guardarlo como regla.
--
-- Requiere supabase_panel_ingeniero.sql (ajustes_ingeniero, es_ingeniero()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Su estilo
-- ----------------------------------------------------------------------------

ALTER TABLE public.ajustes_ingeniero
  ADD COLUMN IF NOT EXISTS estilo_trato  TEXT CHECK (estilo_trato IN ('tu', 'usted')),
  ADD COLUMN IF NOT EXISTS estilo_tono   TEXT CHECK (estilo_tono IN ('cercano', 'formal')),
  ADD COLUMN IF NOT EXISTS estilo_largo  TEXT CHECK (estilo_largo IN ('breve', 'detallado')),
  ADD COLUMN IF NOT EXISTS estilo_emojis BOOLEAN,
  ADD COLUMN IF NOT EXISTS firma         TEXT CHECK (firma IS NULL OR char_length(firma) BETWEEN 1 AND 120);

-- ----------------------------------------------------------------------------
-- 2. Sus correcciones
-- ----------------------------------------------------------------------------
-- El nombre del cliente llega ya cambiado por «[cliente]» desde el panel.

CREATE TABLE IF NOT EXISTS public.abi_correcciones (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  borrador   TEXT NOT NULL CHECK (char_length(borrador) BETWEEN 1 AND 1500),
  final      TEXT NOT NULL CHECK (char_length(final) BETWEEN 1 AND 1500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abi_correcciones_usuario_idx ON public.abi_correcciones (user_id, created_at DESC);

ALTER TABLE public.abi_correcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "correcciones: el ingeniero ve las suyas" ON public.abi_correcciones;
CREATE POLICY "correcciones: el ingeniero ve las suyas"
  ON public.abi_correcciones FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "correcciones: el ingeniero añade las suyas" ON public.abi_correcciones;
CREATE POLICY "correcciones: el ingeniero añade las suyas"
  ON public.abi_correcciones FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

DROP POLICY IF EXISTS "correcciones: el ingeniero borra las suyas" ON public.abi_correcciones;
CREATE POLICY "correcciones: el ingeniero borra las suyas"
  ON public.abi_correcciones FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.es_ingeniero());

REVOKE ALL ON public.abi_correcciones FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.abi_correcciones TO authenticated;

-- Solo se quedan las 5 más recientes de cada ingeniero.
CREATE OR REPLACE FUNCTION public.recortar_correcciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.abi_correcciones c
  WHERE c.user_id = NEW.user_id
    AND c.id NOT IN (
      SELECT r.id FROM public.abi_correcciones r
      WHERE r.user_id = NEW.user_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 5
    );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.recortar_correcciones() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recortar_correcciones ON public.abi_correcciones;
CREATE TRIGGER recortar_correcciones
  AFTER INSERT ON public.abi_correcciones
  FOR EACH ROW EXECUTE FUNCTION public.recortar_correcciones();
