# AIB+ — Motor de Proyecto Autónomo

Monorepo con dos piezas que se levantan por separado:

| Carpeta | Qué es | Puerto |
|---|---|---|
| `Proyecto_AIB/` | Frontend React 19 + Vite + TypeScript | 5173 |
| `server/` | Backend Express que orquesta la API de Claude | 3001 |

La persistencia y la autenticación son Supabase; la previsualización de prototipos se compila en el navegador con Sandpack.

## Requisitos

- Node.js 20 o superior (probado en 24.11)
- Una cuenta de Supabase con un proyecto creado
- Una API key de Anthropic

## Puesta en marcha

### 1. Dependencias

```bash
npm install --prefix Proyecto_AIB && npm install --prefix server
```

### 2. Variables de entorno

Copia cada plantilla y rellena los valores reales. Los `.env` nunca se suben al repo.

```bash
cp Proyecto_AIB/.env.example Proyecto_AIB/.env && cp server/.env.example server/.env
```

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` — en Supabase, *Project Settings > API*.
- `VITE_API_URL` — opcional en local; en despliegue, el dominio público del backend.
- `ANTHROPIC_API_KEY` — en console.anthropic.com.

### 3. Base de datos

Ejecuta estos scripts, en este orden, en el SQL Editor de Supabase:

1. `Proyecto_AIB/supabase_rls_setup.sql` — la tabla `proyectos` y sus políticas de Row Level Security, que garantizan que cada cliente solo vea sus filas.
2. `Proyecto_AIB/supabase_roles_plantillas.sql` — los roles (cliente o ingeniero), el catálogo de plantillas y sus contadores.
3. `Proyecto_AIB/supabase_cuota_ia.sql` — el tope diario de gasto en IA por usuario y en total. Sin él, el servidor rechaza todas las llamadas a la IA. Los límites se cambian en la tabla `limites_ia` (en céntimos de dólar).
4. `Proyecto_AIB/supabase_fotos.sql` — el bucket `fotos` de Storage, donde el cliente sube las fotos de su maqueta: cada usuario solo escribe en su carpeta, solo imágenes y de hasta 2 MB.

Después convierte tu cuenta en ingeniero con la consulta que figura al final del segundo script. Sin eso, `/dashboard` no deja entrar.

Si el segundo script aún no se ha ejecutado, la app sigue funcionando: no hay plantillas y las maquetas web se generan con IA.

### 4. Arrancar

En dos terminales:

```bash
npm run dev --prefix server
```

```bash
npm run dev --prefix Proyecto_AIB
```

La app queda en http://localhost:3000 y el backend en http://localhost:3001. El frontend usa el 3000 porque es el *Site URL* configurado en Supabase: los enlaces de sus correos (recuperación, magic link) llevan ahí.

## Cómo funciona

1. El cliente elige servicio: **Página web**, **ERP** o **Automatización**.
2. **Web** usa un cuestionario fijo de 6 pasos, sin IA mientras se contesta. ERP y Automatización usan el discovery guiado por IA.
3. Al terminar el cuestionario web, AIB+ busca en el catálogo del ingeniero las plantillas que encajan con el negocio y le enseña las mejores ya con su nombre, logo y colores. El cliente elige una y la IA escribe solo sus textos. Si ninguna encaja, o prefiere algo a medida, la IA genera una maqueta completa.
4. El cliente acepta la propuesta y se genera la documentación técnica.
5. El ingeniero la ve en `/dashboard`, junto con su catálogo y lo que rinde cada plantilla.

## Arquitectura

```
Proyecto_AIB/src/
  components/
    panel/        Panel del ingeniero: encargos y catálogo de plantillas
    web/          Módulo web: cuestionario, elección de plantilla, vista previa
    ui/           Primitivas compartidas
  plantillas/     Plantillas base: HTML con huecos, CSS compilado, metadatos
  hooks/          useAuth (sesión) y usePerfil (rol)
  lib/
    api.ts        Único cliente del backend
    servicios.ts  Servicios, preguntas, paletas y presupuestos: se edita aquí
    plantillas.ts Motor de plantillas (Mustache) y paleta del cliente
    catalogo.ts   Catálogo del ingeniero y emparejamiento
    marca.ts      Logo, colores y montaje de las maquetas generadas por IA
    proyectos.ts  Persistencia de proyectos
  index.css       Sistema de diseño de AIB+

server/src/
  app.js          Middlewares, rutas y manejo de errores
  config.js       Variables de entorno, validadas al arrancar
  auth.js         Exige sesión de Supabase en la API
  claude.js       Cliente Claude: streaming, structured outputs, consumo
  prompts.js      Prompts, separados del transporte
  plantillas/     Esquema y prompt de los textos de cada plantilla
  routes/         Un archivo por endpoint

api/index.js      Entrada serverless para Vercel
```

## Plantillas

Una plantilla es una web que el ingeniero ya sabe construir, con huecos donde va el contenido de cada cliente. Rellenarla no requiere que la IA escriba HTML: la estructura, los colores, el logo y los datos fijos se ponen en el navegador, y la IA solo devuelve los textos.

- **HTML** con sintaxis Mustache: `{{nombre}}` inserta texto escapado y `{{#lista}}…{{/lista}}` repite un bloque. Nada de lo que escribe la IA puede colar HTML en la página.
- **Colores**: la plantilla declara qué variables CSS son de marca. Al renderizar se sustituyen por la paleta del cliente y los neutros se mantienen.
- **Textos**: el servidor pide a la IA exactamente la forma que espera la plantilla, con *structured outputs*, y la normaliza (longitudes, precios, colores).

### Añadir una plantilla

1. Crea `Proyecto_AIB/src/plantillas/<id>/` con:
   - `plantilla.html`: el cuerpo de la página con sus huecos.
   - `fuente.css`: su Tailwind de origen. Toma `moda-boutique/fuente.css` como referencia.
   - `index.ts`: metadatos, el tipo de sus textos, unos textos de ejemplo y la función `vista`.
2. Añade su compilación al script `plantillas` de `package.json` y ejecuta `npm run plantillas`.
3. Regístrala en `Proyecto_AIB/src/plantillas/index.ts`.
4. En el servidor, crea `server/src/plantillas/<id>.js` con su esquema, su prompt y su `normalizar`, y regístrala en `server/src/plantillas/index.js`.

El tipo de los textos del frontend y el esquema del servidor deben coincidir.

`moda-boutique` está derivada de la portada de bithia-web: conserva su estructura y sus clases, pero nada de su marca.

## Comandos

| Comando | Efecto |
|---|---|
| `npm run dev --prefix Proyecto_AIB` | Frontend en modo desarrollo |
| `npm run dev --prefix server` | Backend con recarga automática |
| `npm run build --prefix Proyecto_AIB` | Chequeo de tipos y build de producción |
| `npm run lint --prefix Proyecto_AIB` | ESLint |
| `npm run plantillas --prefix Proyecto_AIB` | Recompila el CSS de las plantillas |

## Endpoints del backend

Todos, salvo `/health`, exigen una sesión de Supabase: el cliente envía su `access_token` y el servidor lo valida en cada petición.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/generar-preguntas` | Siguiente ronda de preguntas del discovery con IA |
| `POST` | `/api/generar-prototipo` | Prototipo en React para ERP y Automatización |
| `POST` | `/api/generar-preview-web` | Maqueta web completa en HTML con Bootstrap |
| `POST` | `/api/rellenar-plantilla` | Solo los textos de una plantilla del catálogo |
| `POST` | `/api/generar-documentacion` | Documento técnico al aceptar una propuesta |
| `GET` | `/health` | Estado del servidor y modelo activo |

Cada llamada a la IA registra su consumo real:

```
[AIB+] plantilla:moda-boutique — in: 3078 tok, out: 996 tok, stop: end_turn, 24482ms
```

## Notas de despliegue

- Se despliega en **Vercel**: el frontend como estático y el backend como función serverless (`api/index.js`). `vercel.json` fija el build y un techo de 300 s por función.
- Variables en Vercel: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- La web y la API se sirven desde el mismo dominio, así que no hace falta `VITE_API_URL` ni configurar CORS para el propio sitio.
- **Saldo de Anthropic.** Si se agota, toda la IA cae. El usuario ve un mensaje genérico y el log del servidor muestra `⚠ SIN SALDO EN ANTHROPIC`.
