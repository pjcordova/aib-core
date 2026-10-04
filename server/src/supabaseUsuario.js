// ---------------------------------------------------------------------------
// Consultas a Supabase en nombre del usuario
// ---------------------------------------------------------------------------
// El servidor no tiene clave de administrador: lee la base de datos con el
// token de quien llama, así que las políticas de seguridad (RLS) deciden qué
// ve, igual que en el navegador. ABI ve exactamente lo que ve el ingeniero.
// ---------------------------------------------------------------------------

const { config } = require('./config');

/**
 * Llama a la API REST de Supabase con el token del usuario.
 * @param {string} token Token de la sesión de quien llama.
 * @param {string} ruta Lo que va después de /rest/v1/, por ejemplo "encargos" o "rpc/es_ingeniero".
 * @param {object} [opciones]
 * @param {[string, string][]} [opciones.params] Filtros y columnas, en el formato de PostgREST.
 * @param {object} [opciones.cuerpo] Si se pasa, la llamada es un POST con este JSON.
 */
async function consultarComo(token, ruta, { params = [], cuerpo } = {}) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${ruta}`);
  for (const [clave, valor] of params) url.searchParams.append(clave, valor);

  const respuesta = await fetch(url, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!respuesta.ok) {
    throw new Error(`Supabase respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }
  return respuesta.json();
}

module.exports = { consultarComo };
