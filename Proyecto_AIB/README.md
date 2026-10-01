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
5. `Proyecto_AIB/supabase_compartir.sql` — los enlaces para compartir la maqueta (`/ver/<código>`). Sin sesión solo se puede leer la maqueta de un código válido, nada más del proyecto.
6. `Proyecto_AIB/supabase_seguimiento.sql` — el seguimiento de los encargos (Recibido → En revisión → Propuesta enviada → En desarrollo → Publicada). Solo el ingeniero añade etapas; el cliente ve las de sus proyectos y no puede cambiarlas.
7. `Proyecto_AIB/supabase_encargos.sql` — protege los encargos aceptados (su dueño no puede borrarlos ni deshacer la aceptación) y lleva la cuenta de los avisos al ingeniero, uno por encargo.
8. `Proyecto_AIB/supabase_invitaciones.sql` — las invitaciones: el ingeniero crea un enlace por negocio y el cliente entra sin crear cuenta, con una sesión anónima atada a la invitación. Requiere activar **Allow anonymous sign-ins** en Supabase (Authentication → Sign In / Providers). Una sesión anónima sin invitación activa no puede crear proyectos, subir fotos ni gastar IA, y cada invitación tiene un tope total de gasto (`limites_ia.invitado_centimos`).
9. `Proyecto_AIB/supabase_comentarios.sql` — los comentarios de los clientes sobre su maqueta («¿Qué te parece tu web?»). El cliente solo escribe sobre sus proyectos; solo el ingeniero los lee, en la pestaña Comentarios.

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

1. El ingeniero crea una **invitación** para cada negocio desde su panel y se la manda por WhatsApp (`/i/<código>`). El cliente entra sin crear cuenta y va directo a su página web; con el mismo enlace puede volver. El panel muestra hasta dónde llegó cada invitado: abrió el enlace, empezó, vio su maqueta, aceptó. También se puede entrar con cuenta propia y elegir servicio: **Página web**, **ERP** o **Automatización**.
2. **Web** usa un cuestionario fijo de 7 pasos, sin IA mientras se contesta. El segundo es **para qué quiere la web** (vender, conseguir clientes, informar o promocionar algo puntual): cambia el tono y los botones de la maqueta, y le dice al ingeniero qué tipo de web es. ERP y Automatización usan el discovery guiado por IA.
3. Al terminar el cuestionario web, AIB+ busca en el catálogo del ingeniero las plantillas que encajan con el negocio y le enseña las mejores ya con su nombre, logo y colores. El cliente elige una y la IA escribe solo sus textos. Si ninguna encaja, o prefiere algo a medida, la IA genera una maqueta completa.
4. Con «Compartir», el cliente puede mandar su maqueta a otra persona con un enlace público de solo lectura, que desactiva cuando quiera. La página pública la muestra sin scripts, sin enlaces hacia fuera y con una política de contenido que solo deja cargar estilos, fuentes y fotos propias.
5. El cliente acepta la propuesta y se genera la documentación técnica.
6. El ingeniero la ve en `/dashboard`, junto con su catálogo y lo que rinde cada plantilla. Desde ahí marca la etapa del encargo, con una nota opcional, y puede avisar al cliente por WhatsApp con el mensaje ya escrito. El cliente ve la etapa en su lista de proyectos y la línea de tiempo al abrirlo.

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
    compartir.ts  Enlaces públicos de la maqueta y su limpieza
    seguimiento.ts Etapas del encargo después de aceptar
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
- **Secciones**: los bloques opcionales (quiénes somos, testimonios, preguntas…) solo aparecen, y solo se le piden a la IA, si el cliente eligió esa sección. La plantilla declara en `secciones` cuáles sabe mostrar; las demás se avisan al elegir y le llegan al ingeniero como pendientes.
- **Fotos**: los elementos con `data-aib-foto` son huecos donde el cliente puede poner una foto suya desde «Editar».

Plantillas incluidas:

| id | Para | Origen |
|---|---|---|
| `moda-boutique` | Tiendas de ropa | Derivada de bithia-web |
| `consultora` | Consultoras y servicios profesionales | Derivada de la web de BuenVivir |
| `restaurante` | Restaurantes, cafeterías y comida | Diseñada desde cero |
| `salud-belleza` | Spas, salones, barberías, estética y consultorios | Diseñada desde cero |
| `institucional` | Instituciones, ONG, asociaciones y entidades públicas (webs informativas, sin venta) | Diseñada desde cero |

La IA nunca escribe datos de contacto, direcciones ni nombres de personas; en `restaurante` y `salud-belleza` tampoco precios, horarios ni duraciones, y en `institucional` tampoco fechas de noticias ni enlaces a documentos. La plantilla los muestra como huecos visibles (`[Precio]`, `[Tu dirección]`…) que el cliente completa desde «Editar». Los precios de `moda-boutique` sí son de ejemplo, escritos por la IA.

### Añadir una plantilla

1. Crea `Proyecto_AIB/src/plantillas/<id>/` con:
   - `plantilla.html`: el cuerpo de la página con sus huecos.
   - `fuente.css`: su Tailwind de origen. Toma `consultora/fuente.css` como referencia.
   - `index.ts`: metadatos, el tipo de sus textos, unos textos de ejemplo y la función `vista`.
2. Ejecuta `npm run plantillas`: compila el CSS de todas las carpetas que tengan `fuente.css`.
3. Regístrala en `Proyecto_AIB/src/plantillas/index.ts`.
4. En el servidor, crea `server/src/plantillas/<id>.js` con su esquema, su prompt y su `normalizar` (las utilidades comunes están en `comun.js`), y regístrala en `server/src/plantillas/index.js`.

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
| `POST` | `/api/avisar-encargo` | Correo y WhatsApp al ingeniero cuando un cliente acepta (una vez por encargo) |
| `GET` | `/health` | Estado del servidor y modelo activo |

Cada llamada a la IA registra su consumo real:

```
[AIB+] plantilla:moda-boutique — in: 3078 tok, out: 996 tok, stop: end_turn, 24482ms
```

## Notas de despliegue

- Se despliega en **Vercel**: el frontend como estático y el backend como función serverless (`api/index.js`). `vercel.json` fija el build y un techo de 300 s por función.
- Variables en Vercel: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- **Aviso de encargos nuevos (opcional)**, por uno o por los dos canales. Sin estas variables no se envía nada y todo lo demás funciona igual.
  - Correo: `RESEND_API_KEY` y `AVISOS_CORREO`. La clave se consigue creando una cuenta gratis en resend.com. Sin dominio propio verificado en Resend, `AVISOS_CORREO` debe ser el correo con el que se creó la cuenta.
  - WhatsApp: `AVISOS_WHATSAPP` (con código de país, sin símbolos: `51987654321`) y `CALLMEBOT_APIKEY`. La clave se consigue gratis en callmebot.com: se guarda su número en los contactos y se le manda por WhatsApp la frase que indica. Es un servicio de terceros para avisarse a uno mismo, así que el mensaje solo lleva el nombre del negocio y el enlace al panel; los datos del cliente van por correo.
- La web y la API se sirven desde el mismo dominio, así que no hace falta `VITE_API_URL` ni configurar CORS para el propio sitio.
- **Saldo de Anthropic.** Si se agota, toda la IA cae. El usuario ve un mensaje genérico y el log del servidor muestra `⚠ SIN SALDO EN ANTHROPIC`.
