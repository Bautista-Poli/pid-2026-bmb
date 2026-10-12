# Deploy de Parkit

| Parte | Dónde | URL |
|---|---|---|
| Front (Angular) | Vercel, proyecto `parkit` | https://parkit-swart.vercel.app |
| Back (Express) | Railway, proyecto `ingenious-heart` | https://ingenious-heart-production-2934.up.railway.app |
| Base de datos | Neon, proyecto `ParkIt`, branch `production` | — |
| Fotos | Cloudinary, carpeta `parkit/` | — |

Se deploya **a mano con la CLI** (no se publica solo con cada push): Vercel y
Railway no tienen acceso a la organización `uca-argentina` de GitHub.

## Cómo se conectan

- El front llama siempre a `/api/...` (ruta relativa). En Vercel, `Front/vercel.json`
  reenvía `/api/*` al back de Railway, así para el navegador todo sale del mismo
  dominio y la cookie de sesión (`httpOnly`, `sameSite: lax`) funciona.
- La segunda regla de `vercel.json` manda cualquier otra ruta a `index.html`, para
  que recargar en `/conductor/vehiculos` (o cualquier ruta) no dé 404.
- Las fotos (de estacionamientos y de vehículos) viven en Cloudinary. El navegador
  las sube directo con una firma que da la API, y la API redirige cada foto al CDN
  de Cloudinary. Los vehículos sin foto propia usan las de `Front/public/vehiculos/`.

## Publicar cambios

### 1. Dejar el código listo

La CLI sube **la carpeta tal como está**, no lo que hay en GitHub. Antes de
deployar, pararse en la rama a publicar, actualizada y sin cambios a medias:

```bash
git checkout development
git pull
git status   # que no haya nada sin commitear que no se quiera publicar
```

### 2. Deployar lo que cambió

Si cambiaron los dos, **primero el back**, así el front nuevo no llama a
endpoints que todavía no existen.

**Back** (`Back/`):

```bash
cd Back
npx @railway/cli up
```

Antes de arrancar corre las migraciones (`npm run db:migrate:prod`, ver
`Back/railway.json`), así que los cambios de `schema.sql` se aplican solos.

**Front** (`Front/`):

```bash
cd Front
npx vercel --prod
```

Tarda alrededor de un minuto. No pregunta nada porque la carpeta ya está
vinculada al proyecto (`Front/.vercel/`).

### 3. Comprobar

- Abrir https://parkit-swart.vercel.app y probar el login.
- El back responde en https://ingenious-heart-production-2934.up.railway.app/api/health

## Si algo falla

- **Front:** vercel.com → proyecto `parkit` → Deployments. Ahí está cada deploy y
  se puede volver a uno anterior con "Promote to Production".
- **Back:** railway.com → proyecto `ingenious-heart` → servicio → Deployments → Logs.
- **"Unauthorized" en la CLI:** volver a loguearse con `npx vercel login` o
  `npx @railway/cli login`.

## Configuración

- **Variables del back:** en Railway → servicio → Variables. Son las mismas de
  `Back/.env.example`, con `NODE_ENV=production` y **sin** `PORT` (Railway pone el
  suyo). Si cambia la URL del back, actualizarla en `Front/vercel.json`.
- **Mapa (CARTO):** el dominio `parkit-swart.vercel.app` tiene que estar en los
  dominios permitidos de la clave de CARTO; si no, el mapa cae en OpenStreetMap.
- **Bases separadas:** producción usa la branch `production` de Neon y el
  desarrollo local la branch `dev` (`Back/.env`), así las pruebas no ensucian la
  página publicada. Si `dev` queda muy sucia, en Neon → branch `dev` → "Reset from
  parent" la vuelve a copiar de producción.
- **Cloudinary:** en Railway van `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` y `CLOUDINARY_FOLDER=parkit` (en `dev` la carpeta es
  `parkit-dev`, así no se mezclan). Sin ellas, subir fotos responde 503.

## Tareas de una sola vez en producción

`npx @railway/cli run <comando>` corre el comando **en tu máquina** con las
variables del servicio de Railway (o sea, contra la base de producción). Desde
`Back/`, con la CLI logueada y vinculada (`npx @railway/cli link`):

```bash
npx @railway/cli run npm run db:migrar-fotos-cloudinary:prod   # pasa las fotos de la base a Cloudinary
npx @railway/cli run npm run db:crear-admin:prod -- --email ... --nombre ... --apellido ...
```

`db:crear-admin:prod` muestra a qué base se conecta y pide confirmación y la
contraseña por consola. La migración de fotos se puede volver a correr: solo toma
las que siguen en la base.
- **Archivos locales que no van al repo:** `Front/.vercel/` y `Front/.env.local`
  (token de Vercel) los crea la CLI y ya están en `Front/.gitignore`.
