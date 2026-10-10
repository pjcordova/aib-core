-- ============================================================================
-- AIB+ — Proyectos terminados en el perfil del ingeniero
-- ============================================================================
-- Hasta 6 trabajos que ya hizo (dentro o fuera de AIB+): título, servicio,
-- enlace en vivo, una descripción corta y una imagen opcional (del bucket
-- 'fotos', en su carpeta). Salen en su página pública (/ing/:slug), debajo de
-- sus diseños: lo real da más confianza que una plantilla.
--
-- Ejecutar después de supabase_formularios_servicio.sql (usa
-- clave_servicio_valida y redefine perfil_publico). Se puede ejecutar más de
-- una vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portafolio_ingeniero (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingeniero_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  titulo       TEXT NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 2 AND 80 AND titulo !~ '[<>{}]'),
  servicio     TEXT NOT NULL DEFAULT 'web' CHECK (public.clave_servicio_valida(servicio)),
  enlace       TEXT CHECK (enlace IS NULL OR (enlace ~* '^https?://[^[:space:]<>"]{3,}$' AND char_length(enlace) <= 300)),
  descripcion  TEXT CHECK (descripcion IS NULL OR (char_length(descripcion) <= 240 AND descripcion !~ '[<>{}]')),
  -- Solo imágenes subidas a AIB+ (supabase_fotos.sql).
  imagen_url   TEXT CHECK (
    imagen_url IS NULL
    OR (imagen_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/[^[:space:]<>"]+$'
        AND char_length(imagen_url) <= 400)
  ),
  orden        INTEGER NOT NULL DEFAULT 0,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portafolio_ingeniero_idx ON public.portafolio_ingeniero (ingeniero_id);

ALTER TABLE public.portafolio_ingeniero ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portafolio_ingeniero FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portafolio_ingeniero TO authenticated;

-- Cada ingeniero, los suyos. Los de los demás se ven con perfil_publico().
DROP POLICY IF EXISTS "El ingeniero gestiona su portafolio" ON public.portafolio_ingeniero;
CREATE POLICY "El ingeniero gestiona su portafolio" ON public.portafolio_ingeniero
  FOR ALL TO authenticated
  USING (ingeniero_id = (SELECT auth.uid()))
  WITH CHECK (ingeniero_id = (SELECT auth.uid()) AND public.es_ingeniero());

-- Tope de 6 por ingeniero.
CREATE OR REPLACE FUNCTION public.limitar_portafolio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.portafolio_ingeniero WHERE ingeniero_id = NEW.ingeniero_id) >= 6 THEN
    RAISE EXCEPTION 'Puedes mostrar hasta 6 proyectos' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limitar_portafolio() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limitar_portafolio ON public.portafolio_ingeniero;
CREATE TRIGGER limitar_portafolio
  BEFORE INSERT ON public.portafolio_ingeniero
  FOR EACH ROW EXECUTE FUNCTION public.limitar_portafolio();

-- La misma de supabase_formularios_servicio.sql, con sus proyectos terminados.
CREATE OR REPLACE FUNCTION public.perfil_publico(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', pi.user_id,
    'slug', pi.slug,
    'nombre', pi.nombre,
    'titular', pi.titular,
    'bio', pi.bio,
    'especialidades', to_jsonb(pi.especialidades),
    'servicios', to_jsonb(pi.servicios),
    'servicios_otros', to_jsonb(pi.servicios_otros),
    'anios_experiencia', pi.anios_experiencia,
    'ciudad', pi.ciudad,
    'portafolio_url', pi.portafolio_url,
    'foto_url', pi.foto_url,
    'promedio', (SELECT round(avg(r.estrellas), 1) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'resenas', (SELECT count(*) FROM public.resenas r WHERE r.ingeniero_id = pi.user_id),
    'publicadas', (
      SELECT count(*) FROM public.proyectos p
      WHERE p.ingeniero_id = pi.user_id
        AND (SELECT se.estado FROM public.seguimiento_encargos se WHERE se.proyecto_id = p.id
             ORDER BY se.created_at DESC, se.id DESC LIMIT 1) = 'publicada'
    ),
    'ultimas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'estrellas', r.estrellas,
        'comentario', r.comentario,
        'autor', NULLIF(split_part(btrim(COALESCE(p.payload->'contacto'->>'nombre', '')), ' ', 1), ''),
        'negocio', p.payload->'ficha'->>'empresa',
        'fecha', r.creada_en
      ) ORDER BY r.creada_en DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.resenas WHERE ingeniero_id = pi.user_id ORDER BY creada_en DESC LIMIT 10) r
      JOIN public.proyectos p ON p.id = r.proyecto_id
    ),
    'disenos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'tipo', t.tipo, 'servicio', t.servicio, 'base', t.base, 'nombre', t.nombre,
        'descripcion', t.descripcion, 'categoria', t.categoria, 'estilo', t.estilo,
        'etiquetas', to_jsonb(t.etiquetas), 'nivel', t.nivel, 'precio_desde', t.precio_desde,
        'color_primario', t.color_primario, 'color_secundario', t.color_secundario,
        'html', t.html, 'css', t.css, 'fuentes', to_jsonb(t.fuentes)
      ) ORDER BY t.nivel, t.precio_desde NULLS LAST, t.created_at), '[]'::jsonb)
      FROM (
        SELECT * FROM public.plantillas
        WHERE ingeniero_id = pi.user_id AND activa AND nivel <> 'premium'
        ORDER BY created_at
        LIMIT 12
      ) t
    ),
    'trabajos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', w.id, 'titulo', w.titulo, 'servicio', w.servicio, 'enlace', w.enlace,
        'descripcion', w.descripcion, 'imagen_url', w.imagen_url
      ) ORDER BY w.orden, w.creado_en), '[]'::jsonb)
      FROM public.portafolio_ingeniero w
      WHERE w.ingeniero_id = pi.user_id
    )
  )
  FROM public.perfiles_ingeniero pi
  JOIN public.perfiles pf ON pf.user_id = pi.user_id AND pf.rol = 'ingeniero'
  WHERE pi.slug = p_slug AND pi.estado = 'aprobado';
$$;

REVOKE ALL ON FUNCTION public.perfil_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perfil_publico(TEXT) TO anon, authenticated;
