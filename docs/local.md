# ParkIt local (examen): todo en una máquina, sin internet

Comandos del día a día: ver [`COMANDOS.md`](../COMANDOS.md).

En esta versión la app **no se conecta a nada de afuera**:

| Pieza | Dónde vive |
|---|---|
| Base de datos | Postgres instalado en la máquina (Homebrew, sin Docker) |
| Fotos | Disco: `Back/datos-locales/fotos/<public_id>.<ext>`, servidas por `/api/fotos-locales/...` |
| Mapa | `Back/datos-locales/mapa/caba.pmtiles` (Protomaps, solo CABA), servido por `/api/mapa/...` |
| Direcciones | Provincia de una lista fija; ciudad y calle a mano; el propietario marca el punto en el mapa. El buscador del mapa busca barrios y estacionamientos de la base |
| Fuente Inter | Empaquetada en el front (`@fontsource/inter`) |

La versión con base en Neon, fotos en Cloudinary, Georef/Photon y mapas de CARTO
está en la rama `post-examen` (ver más abajo).

`Back/datos-locales/` no se sube al repo (`.gitignore`).

## Comprobar que no se rompió nada

Desde la raíz del repo:

```bash
npm run check
```

Compila el Front, corre los tests del Front y después los del Back (contra la
base local). Corta en el primer paso que falla y dice cuál fue. Si todo anda,
termina con `✔ Todo OK`.

Los tests del Back crean usuarios `...@<suite>.prueba.parkit` en la base local y
los borran al terminar.

## Levantar la app

```bash
brew services start postgresql@18   # si no está corriendo (pg_isready lo dice)
cd Back  && npm run dev             # API en :3000, lee Back/.env.local
cd Front && npm start               # http://localhost:4200 (proxy de /api a :3000)
```

## Variables (`Back/.env.local`)

Copiar `Back/.env.example` a `Back/.env.local` y completar:

- `DATABASE_URL=postgresql://<tu-usuario-de-macOS>@localhost:5432/parkit_local`
- `JWT_SECRET`: cualquier valor largo (también firma las subidas de fotos).

## Base de datos

| Script (desde `Back/`) | Qué hace |
|---|---|
| `npm run db:crear` | Crea la base local si no existe y aplica `schema.sql` y `seed.sql` |
| `npm run db:migrate` | Vuelve a aplicar el esquema (idempotente) |
| `npm run db:restaurar` | Carga `datos-locales/produccion.dump` (**borra la base antes**) y migra |

Los scripts que escriben en la base se niegan a correr si `DATABASE_URL` no es `localhost`.

## Después del examen: volver a la nube

La rama `post-examen` deshace este cambio (base en Neon, Cloudinary, Georef,
Photon, CARTO). Mergearla a `development` y después a `main`, y volver a usar
`Back/.env` (el de Neon y Cloudinary). Si durante el examen se tocaron los mismos
archivos, el merge puede tener conflictos: se resuelven quedándose con lo nuevo
del examen más la parte de la nube.
