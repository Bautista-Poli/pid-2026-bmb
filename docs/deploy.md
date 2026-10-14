# Deploy de Parkit

| Parte | Dónde | URL |
|---|---|---|
| Front (Angular) | Vercel, proyecto `parkit` | https://parkit-swart.vercel.app |
| Back (Express) | Railway, proyecto `ingenious-heart` | https://ingenious-heart-production-2934.up.railway.app |
| Base de datos | Neon, proyecto `ParkIt`, branch `production` | — |
| Fotos | Cloudinary, carpeta `parkit/` | — |

**Producción sale de la rama `main` del fork** (`Bautista-Poli/pid-2026-bmb`).
Vercel y Railway están conectados a ese repo y deployan solos al recibir un push
a `main`:

- **Front (Vercel):** cualquier push a `main` que cambie algo del front dispara
  el deploy. Un push a `development` solo genera un Preview (URL de prueba).
- **Back (Railway):** solo se deploya cuando cambia `Back/` (Root Directory `/Back`
  y Watch Paths `/Back/**`). Un cambio solo en `Front/` no toca el back.

La CLI (`npx vercel --prod`, `npx @railway/cli up`) queda como plan B, por si
hay que deployar sin pasar por Git (ver "Publicar cambios").

## Repositorios: original y fork

Hay dos repos y tienen que quedar iguales:

- `origin` → `uca-argentina/pid-2026-bmb` (el original del equipo).
- `fork` → `Bautista-Poli/pid-2026-bmb` (fork que usa Vercel para deployar el front).

**Regla: cada commit, push o merge se hace en los dos repositorios.** Por eso
`origin` está configurado para que `git push` vaya a los dos a la vez (dos
URLs de push, ver abajo). No hace falta correr nada aparte.

- `git push` → sube a `origin` y a `fork`.
- `git pull` / `git fetch` → traen de `origin`.
- Un merge en `development` (o en cualquier rama) se hace local y después `git push`.
- Para pasar lo que hay en `origin` al fork sin haber hecho nada local:
  `git push fork origin/main:refs/heads/main origin/development:refs/heads/development`
  (después de `git fetch origin`).

Si el push falla en uno de los dos, el otro puede haber quedado subido: revisar
los dos y repetir el que falló. Si `origin` reescribe su historia (force push),
el fork hay que sincronizarlo también con el comando de arriba y, si hace falta,
con `--force` (solo sobre el fork).

**Configuración** (ya está hecha en el clon local; reproducirla en otra máquina):

```bash
git remote add fork https://github.com/Bautista-Poli/pid-2026-bmb.git
git remote set-url --push origin https://github.com/uca-argentina/pid-2026-bmb.git
git remote set-url --add --push origin https://github.com/Bautista-Poli/pid-2026-bmb.git
```

Verificar con `git remote -v`: `origin` tiene dos líneas `(push)`.

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

### 1. Llevar el cambio a `main`

Los cambios van a `development` por PR o merge, como siempre. Para publicar, se
mergea `development` a `main` y se hace push (va a los dos repos):

```bash
git checkout main
git pull
git merge --no-ff development
git push
```

Eso dispara los deploys de Vercel y Railway (si hubo cambios en `Front/` o en
`Back/`, respectivamente). Antes, que `development` esté limpio y probado.

**Ojo con el orden si cambiaron los dos:** el back tiene que estar arriba antes
que el front nuevo, así el front no llama a endpoints que todavía no existen. Si
Railway termina después que Vercel, esperar a que el deploy del back esté
"Active" antes de dar por publicado el front.

### 2. Plan B: deploy a mano con la CLI

Solo si hace falta publicar sin pasar por `main`. La CLI sube **la carpeta tal
como está**, no lo que hay en GitHub, así que antes hay que pararse en la rama
a publicar y verificar que no haya nada sin commitear.

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

- **Vercel** (proyecto `parkit` → Settings): Git conectado a `Bautista-Poli/pid-2026-bmb`,
  **Production Branch** `main`, **Root Directory** `Front`.
- **Railway** (proyecto `ingenious-heart` → servicio → Settings → Source): repo
  `Bautista-Poli/pid-2026-bmb`, **Branch connected to production** `main`,
  **Root Directory** `/Back`, **Watch Paths** `/Back/**`. **No** poner Start Command:
  el arranque lo define `Back/railway.json`.
- **Acceso de deploy:** los miembros del equipo se invitan a Railway (People del
  workspace) y a Vercel (team), con permiso para deployar.
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
