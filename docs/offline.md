# Modo offline: toda la app en una sola máquina, sin internet

Con `OFFLINE=true` el back no usa ningún servicio externo:

| Pieza | Online (producción) | Offline |
|---|---|---|
| Base de datos | Neon | Postgres instalado en la máquina (Homebrew, **sin Docker**) |
| Fotos | Cloudinary | Disco: `Back/datos-locales/fotos/<public_id>.<ext>`, servidas por `/api/fotos-locales/...` |
| Mapa | Mosaicos de CARTO / OSM | `Back/datos-locales/mapa/amba.pmtiles` (Protomaps, AMBA hasta zoom 15, ~46 MB) |
| Direcciones | Georef / Nominatim / Photon | No se consultan: provincia de una lista fija, ciudad y calle a mano, y el propietario marca el punto en el mapa. El buscador del mapa busca barrios y estacionamientos de la base |
| Fuente Inter | — | Viene empaquetada en el front (`@fontsource/inter`), online y offline |

El front se entera solo: al arrancar consulta `GET /api/entorno` (`{ offline: true }`).
Producción no cambia: sin `OFFLINE` todo sigue como antes.

`Back/datos-locales/` no se sube al repo (`.gitignore`): tiene la copia de la
base de producción, con datos personales.

## Preparar (una sola vez, con internet)

1. **Postgres local.** Con Homebrew: `brew install postgresql@18` y
   `brew services start postgresql@18`. Comprobar con `pg_isready`.
2. **CLI de pmtiles** (para recortar el mapa): `brew install pmtiles`.
3. **Variables:** `cp Back/.env.offline.example Back/.env.offline` y completar:
   - `DATABASE_URL=postgresql://<tu-usuario-de-macOS>@localhost:5432/parkit_local`
   - `JWT_SECRET`: cualquier valor largo.
   - `PRODUCCION_DATABASE_URL`: Neon → proyecto ParkIt → branch `production` →
     Connect, sin "Connection pooling". `pg_dump` solo lee.
   - `CLOUDINARY_CLOUD_NAME`: el de producción (para bajar las fotos).
4. **Dependencias:** `npm install` en `Back/` y en `Front/`.
5. **Todo junto:** desde `Back/`, `npm run offline:preparar`. Hace, en orden:

| Script | Qué hace | Internet |
|---|---|---|
| `offline:base` | Crea la base local si no existe y aplica `schema.sql` y `seed.sql` | No |
| `offline:copiar` | `pg_dump` de producción a `datos-locales/produccion.dump` | Sí |
| `offline:restaurar` | Carga el dump en la base local (**la borra antes**) y vuelve a migrar | No |
| `offline:fotos` | Baja de Cloudinary las fotos que referencia la base (las que ya están no) | Sí |
| `offline:mapa` | Recorta el mapa de AMBA del último build de Protomaps | Sí |

Los scripts que escriben en la base se niegan a correr si `DATABASE_URL` no es
`localhost`, así nunca pisan una base remota.

## Levantar (sin internet)

```bash
cd Back  && npm run dev:offline   # API en :3000, con Back/.env.offline
cd Front && npm start             # http://localhost:4200 (proxy de /api a :3000)
```

Las cuentas son las de producción (se copiaron con sus contraseñas hasheadas).
Para crear un administrador local: `node --env-file=.env.offline src/db/crear-admin.js ...`.

Para volver la base al estado de la copia: `npm run offline:restaurar` (no
necesita internet: usa el dump guardado).

## Cómo está hecho

- `Back/src/config/env.js`: `config.offline` y las carpetas de `config.datosLocales`.
  Offline la geocodificación arranca apagada.
- `Back/src/services/fotos-locales.service.js`: mismo contrato que Cloudinary
  (firma HMAC → subida → `public_id`). `cloudinary.service.js` delega en él,
  así el resto de la API no cambia y las fotos copiadas se encuentran con el
  mismo `public_id`.
- `Back/src/routes/offline.routes.js`: subida (`POST /api/fotos-locales`),
  descarga y el `.pmtiles` (con pedidos Range). Sin `OFFLINE` responden 404.
- Front: `EntornoService`, `utils/fondo-mapa.util.ts` (carga `protomaps-leaflet`
  solo offline), `SelectorUbicacion` en el formulario del estacionamiento y
  `utils/destinos-locales.util.ts` para el buscador del mapa.
- Pruebas: `Back/pruebas/offline.test.mjs`.
