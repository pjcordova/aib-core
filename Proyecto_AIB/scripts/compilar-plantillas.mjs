// Compila el CSS de cada plantilla: src/plantillas/<id>/fuente.css → estilos.css.
// Cada plantilla lleva solo las clases de Tailwind que usa (ver su fuente.css).
// Se ejecuta con `npm run plantillas`.

import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const RAIZ = 'src/plantillas';

for (const carpeta of readdirSync(RAIZ, { withFileTypes: true })) {
  // Solo nombres de carpeta sencillos: van dentro de un comando de shell.
  if (!carpeta.isDirectory() || !/^[a-z0-9-]+$/.test(carpeta.name)) continue;
  const fuente = `${RAIZ}/${carpeta.name}/fuente.css`;
  if (!existsSync(fuente)) continue;

  console.log(`→ ${carpeta.name}`);
  execSync(`npx tailwindcss -i ${fuente} -o ${RAIZ}/${carpeta.name}/estilos.css --minify`, { stdio: 'inherit' });
}
