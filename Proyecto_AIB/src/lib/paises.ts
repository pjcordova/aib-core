// ---------------------------------------------------------------------------
// Países de los ingenieros
// ---------------------------------------------------------------------------
// Se guarda el código ISO de dos letras (perfiles_ingeniero.pais, en
// supabase_pais_ingeniero.sql) y el cliente ve la bandera junto al nombre
// (components/ui/Bandera.tsx). Si falta uno, se agrega aquí y su bandera allá.
// ---------------------------------------------------------------------------

export interface Pais {
  codigo: string;
  nombre: string;
}

/** Perú primero (donde empezó AIB+); el resto, por orden alfabético. */
export const PAISES: Pais[] = [
  { codigo: 'PE', nombre: 'Perú' },
  { codigo: 'AR', nombre: 'Argentina' },
  { codigo: 'BO', nombre: 'Bolivia' },
  { codigo: 'CL', nombre: 'Chile' },
  { codigo: 'CO', nombre: 'Colombia' },
  { codigo: 'EC', nombre: 'Ecuador' },
  { codigo: 'ES', nombre: 'España' },
  { codigo: 'US', nombre: 'Estados Unidos' },
  { codigo: 'MX', nombre: 'México' },
  { codigo: 'PY', nombre: 'Paraguay' },
  { codigo: 'UY', nombre: 'Uruguay' },
  { codigo: 'VE', nombre: 'Venezuela' },
];

export const nombrePais = (codigo: string | null | undefined): string | null =>
  PAISES.find((p) => p.codigo === codigo)?.nombre ?? null;

/** Zonas horarias que dicen el país sin dudas (las de Argentina van aparte). */
const POR_ZONA: Record<string, string> = {
  'America/Lima': 'PE',
  'America/La_Paz': 'BO',
  'America/Santiago': 'CL',
  'America/Bogota': 'CO',
  'America/Guayaquil': 'EC',
  'Europe/Madrid': 'ES',
  'America/Mexico_City': 'MX',
  'America/Monterrey': 'MX',
  'America/Merida': 'MX',
  'America/Cancun': 'MX',
  'America/Tijuana': 'MX',
  'America/Chihuahua': 'MX',
  'America/Hermosillo': 'MX',
  'America/Mazatlan': 'MX',
  'America/Matamoros': 'MX',
  'America/Bahia_Banderas': 'MX',
  'America/Asuncion': 'PY',
  'America/Montevideo': 'UY',
  'America/Caracas': 'VE',
};

/**
 * El país que sugiere el navegador, para no empezar el formulario en blanco:
 * primero por la zona horaria, después por el idioma («es-MX»). null si no
 * está en la lista.
 */
export function paisDelNavegador(): string | null {
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (zona.startsWith('America/Argentina/') || zona === 'America/Buenos_Aires') return 'AR';
    if (POR_ZONA[zona]) return POR_ZONA[zona];
  } catch {
    // Sin zona horaria: queda el idioma.
  }
  const region = navigator.language?.split('-')[1]?.toUpperCase();
  return region && PAISES.some((p) => p.codigo === region) ? region : null;
}
