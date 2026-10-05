-- ============================================================================
-- AIB+ — Vista previa de los enlaces en WhatsApp
-- ============================================================================
-- Cuando el ingeniero manda una invitación (/i/<código>) o el cliente comparte
-- su maqueta (/ver/<código>), WhatsApp pide la página para armar la tarjeta
-- con título e imagen. Esa visita no ejecuta JavaScript, así que el servidor
-- responde con las etiquetas ya puestas y el nombre del negocio en el título.
--
-- vista_previa_enlace() devuelve solo ese nombre. No abre la invitación ni
-- cuenta una apertura de la maqueta: es WhatsApp quien mira, no el cliente.
--
-- Ejecutar después de supabase_invitaciones.sql y supabase_compartir.sql. Se
-- puede ejecutar más de una vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vista_previa_enlace(p_tipo TEXT, p_token TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT left(btrim(nombre), 80)
  FROM (
    SELECT CASE
      WHEN p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN NULL
      WHEN p_tipo = 'invitacion' THEN
        (SELECT i.negocio FROM public.invitaciones i WHERE i.token = p_token AND i.activa)
      WHEN p_tipo = 'maqueta' THEN
        (SELECT p.payload->'ficha'->>'empresa'
         FROM public.enlaces_compartidos e
         JOIN public.proyectos p ON p.id = e.proyecto_id
         WHERE e.token = p_token)
    END AS nombre
  ) t;
$$;

REVOKE ALL ON FUNCTION public.vista_previa_enlace(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vista_previa_enlace(TEXT, TEXT) TO anon, authenticated;
