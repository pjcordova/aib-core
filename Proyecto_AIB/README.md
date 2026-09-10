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

Ejecuta `Proyecto_AIB/supabase_rls_setup.sql` en el SQL Editor de tu proyecto Supabase. Crea la tabla `proyectos` y sus políticas de Row Level Security, que son lo que garantiza que cada usuario solo vea sus propias filas.

### 4. Arrancar

Ambos servicios a la vez:

```bash
npm run dev:all --prefix Proyecto_AIB
```

O por separado, en dos terminales:

```bash
npm run dev --prefix server
```

```bash
npm run dev --prefix Proyecto_AIB
```

La app queda en http://localhost:5173.

## Arquitectura

```
Proyecto_AIB/src/
  components/
    ui/           Primitivas compartidas (marca, errores, progreso, ErrorBoundary)
    *.tsx         Pantallas
  hooks/          useAuth — sesión de Supabase como estado
  lib/
    api.ts        Único cliente del backend; convierte fallos en ApiError
    supabase.ts   Cliente de Supabase
  index.css       Sistema de diseño: tokens, base y componentes

server/
  index.js        Ensamblado: middlewares, rutas, manejo de errores
  src/
    config.js     Variables de entorno, validadas al arrancar
    prompts.js    Los prompts, separados del transporte
    claude.js     Cliente Claude: streaming, consumo y truncado
    routes/       Un archivo por endpoint
```

Dos reglas que sostienen lo demás: **el color y la tipografía sólo se definen en `index.css`** (los componentes usan tokens, nunca valores sueltos), y **ninguna pantalla llama a `fetch` directamente** — todo pasa por `lib/api.ts`, que es donde los errores se vuelven legibles.

## Comandos

| Comando | Efecto |
|---|---|
| `npm run dev --prefix Proyecto_AIB` | Frontend en modo desarrollo |
| `npm run dev --prefix server` | Backend con recarga automática (nodemon) |
| `npm run build --prefix Proyecto_AIB` | Chequeo de tipos + build de producción |
| `npm run lint --prefix Proyecto_AIB` | ESLint |

## Endpoints del backend

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/generar-preguntas` | Devuelve la siguiente ronda de preguntas de discovery en JSON |
| `POST` | `/api/generar-prototipo` | Devuelve un componente React completo para renderizar en Sandpack |
| `GET` | `/health` | Estado del servidor, modelo activo y uptime |

Ambos aceptan `{ servicio, historial }` y registran en consola el consumo real de tokens de cada llamada:

```
[AIB+] prototipo — in: 1043 tok, out: 7891 tok, stop: end_turn
```

## Notas de despliegue

- Define `ALLOWED_ORIGINS` en producción con el dominio del frontend. En desarrollo, por defecto se aceptan los puertos de Vite.
- Define `VITE_API_URL` en el frontend con el dominio público del backend.
- El servidor no arranca si falta `ANTHROPIC_API_KEY`: falla al inicio en vez de en la primera petición del usuario.
- `npm run dev:all` lanza los dos servicios con `concurrently`. Si tu entorno inyecta una variable `PORT`, el backend la hereda y chocará con Vite; en ese caso arranca cada servicio por separado.
