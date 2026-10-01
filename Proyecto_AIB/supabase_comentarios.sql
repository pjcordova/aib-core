-- ============================================================================
-- AIB+ — Comentarios de los clientes sobre su maqueta
-- ============================================================================
-- Debajo de la maqueta, el cliente puede decir qué le parece y qué le faltó.
-- Es el feedback que hoy llega por WhatsApp y se pierde; aquí queda guardado
-- y el ingeniero lo ve en su panel.
--
-- El cliente solo escribe los suyos, sobre sus proyectos. Una sesión anónima
-- sin invitación activa no escribe (puede_crear, de supabase_invitaciones.sql).
-- Solo el ingeniero los lee.
--
-- Ejecutar después de supabase_invitaciones.sql. Se puede ejecutar más de una
-- vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.comentarios (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  proyecto_id UUID REFERENCES public.proyectos(id) ON DELETE SET NULL,
  reaccion    TEXT CHECK (reaccion IN ('encanta', 'bien', 'no_convence')),
  texto       TEXT CHECK (texto IS NULL OR char_length(btrim(texto)) BETWEEN 1 AND 1000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reaccion IS NOT NULL OR texto IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS comentarios_fecha_idx ON public.comentarios (created_at DESC);

ALTER TABLE public.comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comentarios: el cliente escribe sobre lo suyo" ON public.comentarios;
CREATE POLICY "comentarios: el cliente escribe sobre lo suyo"
  ON public.comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.puede_crear()
    AND (
      proyecto_id IS NULL
      OR EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "comentarios: el ingeniero los lee" ON public.comentarios;
CREATE POLICY "comentarios: el ingeniero los lee"
  ON public.comentarios FOR SELECT TO authenticated
  USING (public.es_ingeniero());
