import type { ReactNode } from 'react';
import { nombrePais } from '../../lib/paises';

// La bandera del país del ingeniero, dibujada aquí: en Windows los emojis de
// banderas salen como letras («AR»). Son versiones simples, para verse a
// tamaño de texto. Los países están en lib/paises.ts.

/** Franjas horizontales iguales, de arriba abajo. */
const franjas = (...colores: string[]) =>
  colores.map((color, i) => (
    <rect key={i} y={(20 / colores.length) * i} width="30" height={20 / colores.length + 0.01} fill={color} />
  ));

/** Tres franjas verticales iguales, de izquierda a derecha. */
const vertical = (a: string, b: string, c: string) => [
  <rect key="a" width="10" height="20" fill={a} />,
  <rect key="b" x="10" width="10" height="20" fill={b} />,
  <rect key="c" x="20" width="10" height="20" fill={c} />,
];

/** Las estrellas de Venezuela, en arco sobre la franja azul. */
const ARCO_VENEZUELA = [
  [10.3, 10.97],
  [11.17, 10.07],
  [12.5, 9.4],
  [14.13, 9.05],
  [15.87, 9.05],
  [17.5, 9.4],
  [18.83, 10.07],
  [19.7, 10.97],
];

const DIBUJOS: Record<string, ReactNode> = {
  PE: vertical('#D91023', '#FFFFFF', '#D91023'),
  AR: [...franjas('#74ACDF', '#FFFFFF', '#74ACDF'), <circle key="sol" cx="15" cy="10" r="2" fill="#F6B40E" />],
  BO: franjas('#D52B1E', '#F9E300', '#007934'),
  BR: [
    <rect key="verde" width="30" height="20" fill="#009C3B" />,
    <polygon key="rombo" points="15,2.2 27.4,10 15,17.8 2.6,10" fill="#FFDF00" />,
    <circle key="globo" cx="15" cy="10" r="4.4" fill="#002776" />,
    <path key="lema" d="M10.9 9.1 Q15 7.9 19.3 10.4" stroke="#FFFFFF" strokeWidth="0.9" fill="none" />,
  ],
  // La flor de cinco pétalos sobre rojo.
  HK: [
    <rect key="rojo" width="30" height="20" fill="#DE2910" />,
    ...[0, 72, 144, 216, 288].map((giro) => (
      <ellipse key={giro} cx="15" cy="6.9" rx="1.5" ry="3" fill="#FFFFFF" transform={`rotate(${giro} 15 10)`} />
    )),
  ],
  CL: [
    <rect key="rojo" width="30" height="20" fill="#D52B1E" />,
    <rect key="blanco" width="30" height="10" fill="#FFFFFF" />,
    <rect key="azul" width="10" height="10" fill="#0039A6" />,
    <polygon key="estrella" points="5,2.2 5.9,4.6 8.4,4.6 6.4,6.1 7.1,8.5 5,7.1 2.9,8.5 3.6,6.1 1.6,4.6 4.1,4.6" fill="#FFFFFF" />,
  ],
  CO: [
    <rect key="rojo" width="30" height="20" fill="#CE1126" />,
    <rect key="azul" width="30" height="15" fill="#003893" />,
    <rect key="amarillo" width="30" height="10" fill="#FCD116" />,
  ],
  EC: [
    <rect key="rojo" width="30" height="20" fill="#ED1C24" />,
    <rect key="azul" width="30" height="15" fill="#034EA2" />,
    <rect key="amarillo" width="30" height="10" fill="#FFDD00" />,
    <circle key="escudo" cx="15" cy="10" r="2.2" fill="#8C6A3A" />,
  ],
  ES: [<rect key="rojo" width="30" height="20" fill="#AA151B" />, <rect key="amarillo" y="5" width="30" height="10" fill="#F1BF00" />],
  US: [
    <rect key="blanco" width="30" height="20" fill="#FFFFFF" />,
    ...[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(20 / 13) * i} width="30" height={20 / 13} fill="#B22234" />),
    <rect key="azul" width="12" height={(20 / 13) * 7} fill="#3C3B6E" />,
  ],
  MX: [...vertical('#006847', '#FFFFFF', '#CE1126'), <circle key="escudo" cx="15" cy="10" r="2.4" fill="#8C5A2B" />],
  PY: [
    ...franjas('#D52B1E', '#FFFFFF', '#0038A8'),
    <circle key="escudo" cx="15" cy="10" r="2" fill="none" stroke="#0038A8" strokeWidth="0.8" />,
  ],
  UY: [
    <rect key="blanco" width="30" height="20" fill="#FFFFFF" />,
    ...[1, 3, 5, 7].map((i) => <rect key={i} y={(20 / 9) * i} width="30" height={20 / 9} fill="#0038A8" />),
    <rect key="canton" width="11" height={(20 / 9) * 5} fill="#FFFFFF" />,
    <circle key="sol" cx="5.5" cy="5.5" r="2.6" fill="#FCD116" />,
  ],
  VE: [
    ...franjas('#FFCC00', '#00247D', '#CF142B'),
    ...ARCO_VENEZUELA.map(([cx, cy], i) => <circle key={`e${i}`} cx={cx} cy={cy} r="0.55" fill="#FFFFFF" />),
  ],
};

/**
 * La bandera de un país (código ISO de dos letras), del alto del texto que la
 * rodea. Nada si el país no está en la lista.
 */
export function Bandera({ pais, className = '' }: { pais: string | null | undefined; className?: string }) {
  const nombre = nombrePais(pais);
  const dibujo = pais ? DIBUJOS[pais] : null;
  if (!nombre || !dibujo) return null;
  return (
    <svg
      viewBox="0 0 30 20"
      role="img"
      aria-label={nombre}
      className={'inline-block h-[0.8em] w-[1.2em] shrink-0 rounded-[2px] align-[-0.05em] ring-1 ring-black/10 ' + className}
    >
      <title>{nombre}</title>
      {dibujo}
    </svg>
  );
}
