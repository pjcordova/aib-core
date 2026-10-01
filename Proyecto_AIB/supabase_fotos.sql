-- ============================================================================
-- AIB+ — Fotos del cliente en su maqueta
-- ============================================================================
-- El cliente sube fotos de sus productos o su local y ocupan los huecos de la
-- maqueta. Se guardan en Supabase Storage, no dentro del proyecto: seis fotos
-- como data URI harían pesar cada fila cientos de KB.
--
-- El bucket es de lectura pública porque las fotos son para una web pública
-- y el iframe aislado de la maqueta no puede enviar la sesión. Las rutas
-- llevan un identificador aleatorio y no hay política de lectura sobre
-- storage.objects, así que nadie puede listar las fotos de otros.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos', 'fotos', true, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Cada usuario sube solo a su carpeta: fotos/<su id>/...
-- supabase_invitaciones.sql la sustituye: una sesión anónima sin invitación activa no sube fotos.
DROP POLICY IF EXISTS "Cada usuario sube fotos a su carpeta" ON storage.objects;
CREATE POLICY "Cada usuario sube fotos a su carpeta"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'fotos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Y solo puede borrar las suyas.
DROP POLICY IF EXISTS "Cada usuario borra sus fotos" ON storage.objects;
CREATE POLICY "Cada usuario borra sus fotos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'fotos' AND (storage.foldername(name))[1] = auth.uid()::text);
