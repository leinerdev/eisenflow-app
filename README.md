# Eisenflow

Eisenflow es una matriz Eisenhower personal construida con React + TypeScript, backend serverless y persistencia en MongoDB Atlas.

## Que incluye

- UI responsive con matriz 2x2 y drag-and-drop.
- Estados por tarea: Por hacer, En foco y Hecha.
- Login privado con password unica y cookie httpOnly firmada.
- API serverless en `/api` preparada para desplegar en Vercel.
- Persistencia remota en MongoDB Atlas.
- Acciones rapidas para cargar ejemplos, filtrar, editar y limpiar completadas.

## Variables de entorno

Copia `.env.example` y configura estos valores en local o en Vercel:

```bash
MONGODB_URI=
MONGODB_DB_NAME=eisenflow
EISENFLOW_APP_PASSWORD=
EISENFLOW_SESSION_SECRET=
```

## Scripts

```bash
npm install
npm run dev        # solo frontend Vite
npm run dev:full   # frontend + API con Vercel dev
npm run build
npm run lint
```

## Despliegue en Vercel

1. Crea un cluster en MongoDB Atlas y copia el `MONGODB_URI`.
2. Importa este repositorio en Vercel.
3. Define las cuatro variables de entorno del bloque anterior.
4. Despliega; Vercel servira el frontend y las funciones de `/api` en el mismo dominio.
5. Entra con tu `EISENFLOW_APP_PASSWORD` y usa la app de forma privada.

## Arquitectura

- `src/`: interfaz React.
- `shared/`: tipos y reglas compartidas entre cliente y API.
- `api/`: funciones serverless para auth y CRUD de tareas.

## Nota de desarrollo

Si abres solo `npm run dev`, la API no estara disponible; para probar MongoDB y autenticacion en local usa `npm run dev:full`.
