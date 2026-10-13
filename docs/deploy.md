# Deploy de Parkit

| Parte | Dónde | URL |
|---|---|---|
| Front (Angular) | Vercel, proyecto `parkit` | https://parkit-swart.vercel.app |
| Back (Express) | Railway, proyecto `ingenious-heart` | https://ingenious-heart-production-2934.up.railway.app |
| Base de datos | Neon (la misma que usa `Back/.env`) | — |

Se deploya **a mano con la CLI** (no se publica solo con cada push): Vercel y
Railway no tienen acceso a la organización `uca-argentina` de GitHub.

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
- Las fotos de los estacionamientos viven en la base y se sirven por la API; las
  de vehículos son las de `Front/public/vehiculos/`.

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
- **Base compartida:** producción y desarrollo usan la misma base de Neon, así que
  los datos de prueba se ven en la página publicada.
- **Archivos locales que no van al repo:** `Front/.vercel/` y `Front/.env.local`
  (token de Vercel) los crea la CLI y ya están en `Front/.gitignore`.
