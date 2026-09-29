// ---------------------------------------------------------------------------
// Contacto del cliente
// ---------------------------------------------------------------------------
// Al aceptar, el cliente deja su nombre y su WhatsApp para que el ingeniero
// pueda escribirle. Antes el encargo llegaba sin ningún dato de contacto y el
// recorrido terminaba en un callejón sin salida.
// ---------------------------------------------------------------------------

/**
 * Deja un WhatsApp en formato internacional sin símbolos ("51987654321"), que
 * es lo que espera wa.me. Acepta celulares peruanos con o sin el 51 delante y
 * números de otros países si empiezan por "+". Devuelve null si no es válido.
 */
export function normalizarWhatsapp(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (/^9\d{8}$/.test(digitos)) return `51${digitos}`;
  if (/^519\d{8}$/.test(digitos)) return digitos;
  if (valor.trim().startsWith('+') && digitos.length >= 8 && digitos.length <= 15) return digitos;
  return null;
}

/** "51987654321" → "+51 987 654 321". Otros países: "+" y los dígitos. */
export function formatearWhatsapp(numero: string): string {
  const peruano = numero.match(/^51(9\d{2})(\d{3})(\d{3})$/);
  return peruano ? `+51 ${peruano[1]} ${peruano[2]} ${peruano[3]}` : `+${numero}`;
}

/** Enlace que abre un chat de WhatsApp con el mensaje ya escrito. */
export function enlaceWhatsapp(numero: string, mensaje: string): string | null {
  if (!/^\d{8,15}$/.test(numero)) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
