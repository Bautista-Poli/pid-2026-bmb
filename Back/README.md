# Parkit - Backend

API REST de **Parkit**, la plataforma que conecta conductores con propietarios de
estacionamientos para buscar, comparar y reservar lugares disponibles.
Proyecto de la software factory UCAio (Proyecto Integral de Desarrollo, UCA).

Stack: **Node.js + Express 5 + PostgreSQL** (SQL crudo con `pg`, sin ORM).

---

## Puesta en marcha

```bash
npm install
cp .env.example .env        # completar DATABASE_URL y JWT_SECRET
npm run db:migrate          # crea tablas, constraints y tipos de vehiculo
npm run dev
```

La API queda en `http://localhost:3000/api` y `GET /api/health` responde el estado.

### Scripts

| Comando                   | Descripcion                                        |
| ------------------------- | -------------------------------------------------- |
| `npm run dev`             | Servidor con recarga automatica (`node --watch`)    |
| `npm start`               | Servidor en modo produccion                         |
| `npm run db:migrate`      | Aplica `schema.sql` + `seed.sql` leyendo `.env`     |
| `npm run db:migrate:prod` | Igual, pero tomando las env vars del entorno        |
| `npm test`                | Pruebas de la API (ver mas abajo)                   |
| `npm run test:ci`         | Igual, pero sin leer `.env` (las vars ya estan)     |

`db:migrate` solo crea el esquema y el catalogo de tipos de vehiculo: la base
queda vacia y los usuarios se dan de alta desde `/registrarse` en el front.

### Pruebas

```bash
npm test
```

Son **pruebas de integracion** con el runner que trae Node (`node --test`), sin
dependencias extra. Cada archivo de `pruebas/` levanta la API en un puerto libre
dentro del mismo proceso, asi que no hace falta tener el servidor corriendo:
alcanza con que `DATABASE_URL` apunte a una base ya migrada.

| Archivo                          | Que cubre                                              |
| -------------------------------- | ------------------------------------------------------ |
| `auth.test.mjs`                  | Registro, login, perfil, roles y baja de cuenta         |
| `vehiculo.test.mjs`              | ABM de vehiculos y vehiculo predeterminado              |
| `estacionamiento.test.mjs`       | ABM, publicacion, baja en cascada y cocheras            |
| `reserva.test.mjs`               | Reservas, solapamientos, concurrencia y ciclo completo  |

Las pruebas **no dependen de los datos de ejemplo**: cada una crea sus propios
usuarios (con email `...@<suite>.prueba.parkit`) y al terminar borra todo lo que
creo. Por eso se pueden correr las veces que haga falta, incluso contra una base
con datos, sin ensuciarla.

`pruebas/ayuda.mjs` tiene lo compartido: el cliente HTTP, los atajos para crear
usuarios, estacionamientos y vehiculos, y la limpieza final.

### Variables de entorno

| Variable            | Obligatoria | Default         | Notas                                              |
| ------------------- | ----------- | --------------- | -------------------------------------------------- |
| `DATABASE_URL`      | si          | —               | Neon: la cadena que da el panel, con `?sslmode=require` |
| `JWT_SECRET`        | si          | —               | Cadena larga y aleatoria                            |
| `PORT`              | no          | `3000`          | Railway la define automaticamente                   |
| `NODE_ENV`          | no          | `development`   |                                                     |
| `API_PREFIX`        | no          | `/api`          |                                                     |
| `DATABASE_SSL`      | no          | `true` en prod  | `true` con Neon o cualquier proveedor administrado  |
| `DATABASE_POOL_MAX` | no          | `10`            | Conexiones maximas del pool                         |
| `JWT_EXPIRES_IN`    | no          | `1d`            |                                                     |
| `BCRYPT_ROUNDS`     | no          | `10`            |                                                     |

El proceso **falla al arrancar** si falta `DATABASE_URL` o `JWT_SECRET`, en vez de
levantar y romper en el primer request.

### Despliegue en Railway

1. Crear el proyecto y agregar el plugin **PostgreSQL** (expone `DATABASE_URL`).
2. Definir `JWT_SECRET`, `NODE_ENV=production` y `DATABASE_SSL=true`.
3. `railway.json` ya deja configurado el start command
   (`db:migrate:prod && start`, la migracion es idempotente) y el healthcheck
   sobre `/api/health`.

El servidor escucha en `0.0.0.0`, respeta `PORT`, confia en el proxy
(`trust proxy`) y cierra ordenadamente ante `SIGTERM`.

---

## Estructura

```
src/
├── config/
│   ├── env.js              Variables de entorno validadas al arrancar
│   └── database.js         Pool de pg, helper query() y withTransaction()
├── db/
│   ├── schema.sql          DDL completo (tablas, FKs, UNIQUEs, CHECKs, EXCLUDE)
│   ├── seed.sql            Catalogo TIPO_VEHICULO (Auto / Moto / Camioneta)
│   └── migrate.js          Runner idempotente de schema + seed
├── routes/                 Definicion de endpoints y middlewares por ruta
├── controllers/            Traducen HTTP <-> servicios (sin logica de negocio)
├── services/               Logica de negocio y todo el SQL
├── middlewares/            auth (JWT + roles), validate, notFound, errorHandler
├── validators/             Validacion y normalizacion de la entrada
├── utils/                  ApiError, asyncHandler, jwt, horario, constantes de dominio
├── app.js                  Armado de la app Express
└── index.js                Arranque, healthcheck de DB y shutdown
```

Flujo de un request:

```
routes → middlewares (auth / rol / validate) → controller → service → PostgreSQL
                                                              ↓
                                                  errorHandler (respuesta unica)
```

---

## Modelo de datos

Fiel a `UCAio_modelo_ER.drawio.png`. Ocho tablas:

| Tabla             | PK                   | Restricciones destacadas                                     |
| ----------------- | -------------------- | ------------------------------------------------------------ |
| `usuario`         | `id_usuario` UUID    | `UNIQUE(email)`, `rol` ENUM (CONDUCTOR/PROPIETARIO)           |
| `tipo_vehiculo`   | `id_tipo_vehiculo`   | SMALLINT identity, `UNIQUE(nombre)`                           |
| `estacionamiento` | `id_estacionamiento` | FK → usuario, CHECKs de tarifa y coordenadas                  |
| `horario`         | `id_horario`         | `UNIQUE(id_estacionamiento, dia_semana)`, CHECK 0-6           |
| `excepcion`       | `id`                 | FK → estacionamiento                                          |
| `vehiculo`        | `id_vehiculo`        | **`UNIQUE(patente)`**, FKs → usuario y tipo_vehiculo          |
| `cochera`         | `id_cochera`         | **`UNIQUE(id_estacionamiento, identificador)`**, estado ENUM  |
| `reserva`         | `id_reserva`         | FKs → usuario/vehiculo/cochera, `CHECK (fin > inicio)` y EXCLUDE anti-solapamiento |

### Observaciones sobre el ER

Estas decisiones vale la pena revisarlas con el equipo:

1. **`USUARIO.id_usuario` figura como `ID`** (el resto de las entidades usa UUID).
   Se implemento como `UUID` por consistencia.
2. **`email` no estaba marcado como UNIQUE**, pero el login lo necesita, asi que
   se agrego `usuario_email_unico`.
3. **`inicio` / `fin` de RESERVA y los `created_at` son `TIMESTAMPTZ`**, no
   `TIMESTAMP`. Con `TIMESTAMP` sin zona, un cambio de huso o de horario de
   verano corrompe el calculo de solapamientos.
4. **La tabla `EXCEPCION` parece estar a medio definir** en el diagrama: `dia`
   figura como `TIME` (deberia ser `DATE`) y conviven `horario : TIMESTAMP` con
   `hora_apertura : TIME`. Se creo tal cual esta dibujada y todavia no la usa
   ningun endpoint. Deberia normalizarse antes del Sprint 2.
5. **`COCHERA.estado_actual` no se modifica al reservar.** Representa el estado
   fisico del lugar en este momento; una reserva a futuro no lo cambia. La
   ocupacion se deriva de las reservas vigentes: los listados de cocheras traen
   `reservada_ahora` cuando hay una reserva transcurriendo.
6. **`horario.dia_semana` usa 0 = domingo**, igual que `Date.getDay()` en JS.
7. **Hora local.** Las fechas y horas de negocio (franjas, horarios de
   atencion, "reservas de hoy") se interpretan en hora argentina, UTC-3 fijo.
   Ver `src/utils/horario.js`.
8. **Campos que no estaban en el ER** y usa el front (se agregan con
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` al final de `schema.sql`):
   - `estacionamiento`: `descripcion`, `cubierto` y la direccion desglosada
     (`calle`, `numero`, `ciudad`, `provincia`, `codigo_postal`). La columna
     `direccion` se sigue guardando, armada como `calle numero`, porque la usa
     la busqueda por texto.
   - `cochera`: `sector` (ubicacion en lenguaje natural, ej. "Primer piso") y
     `cubierta`.
   - `vehiculo`: `color` y `predeterminado` (como mucho uno por conductor,
     garantizado con un indice unico parcial).
9. **Foto del estacionamiento.** No estaba en el ER. Vive en su propia tabla,
   `estacionamiento_foto` (`id_estacionamiento`, `mime`, `bytes`, `actualizada`),
   y no en un archivo en disco: el backend corre en un PaaS con filesystem
   efimero, asi que los bytes se guardan en la misma base ya respaldada. La
   sirve `GET /:id/foto`, publica y sin cache-busting propio (lo pone el
   front con `?v=`).

---

## Endpoints

Autenticacion: cookie httpOnly `parkit_token` (la pone el backend en
`/auth/login`, `/register`, etc.; el cliente nunca la lee ni la manda a mano,
el browser la manda solo en cada request a `/api`).

### Auth

| Metodo | Ruta                 | Acceso   | Descripcion                          |
| ------ | -------------------- | -------- | ------------------------------------ |
| POST   | `/api/auth/register` | publico  | Alta con rol CONDUCTOR o PROPIETARIO |
| POST   | `/api/auth/login`    | publico  | Devuelve el usuario y deja la cookie de sesion |
| POST   | `/api/auth/logout`   | publico  | Borra la cookie de sesion            |
| GET    | `/api/auth/me`       | cookie   | Perfil del usuario autenticado       |
| PATCH  | `/api/auth/me`       | cookie   | Edita datos, contrasena y perfiles habilitados |
| DELETE | `/api/auth/me`       | cookie   | Baja de la cuenta (logica)           |
| POST   | `/api/auth/rol`      | cookie   | Cambia el perfil activo y renueva la cookie |

El usuario tiene un perfil activo (`rol`) y la lista de los que puede usar
(`roles`). Al registrarse queda habilitado solo el elegido; `POST /api/auth/rol`
falla con `403` si se pide uno que no esta en `roles`.

```jsonc
// POST /api/auth/rol
{ "rol": "PROPIETARIO" }

// PATCH /api/auth/me  (todo opcional; devuelve el usuario y renueva la cookie)
{ "nombre": "Ana", "telefono": "1155667788",
  "roles": ["CONDUCTOR", "PROPIETARIO"],
  "password": "nuevaClave123", "passwordActual": "secreto123" }
```

Para cambiar la contrasena hay que mandar tambien `passwordActual` (`401` si no
coincide). Si se quita el perfil activo queda activo el primero de los que
sigan habilitados, y por eso la respuesta renueva la cookie con el rol nuevo.

`DELETE /api/auth/me` es una baja logica: cancela las reservas del usuario que
todavia no pasaron (las que hizo y las que recibio en sus cocheras), desactiva
sus vehiculos y estacionamientos, y marca la cuenta como inactiva. El historial
queda. Despues de la baja el token deja de servir: `authenticate` verifica en
cada request que la cuenta siga activa y que el perfil del token siga
habilitado.

```jsonc
// POST /api/auth/register
{ "nombre": "Ana", "apellido": "Perez", "email": "ana@mail.com",
  "password": "secreto123", "rol": "PROPIETARIO", "telefono": "1155667788" }
```

### Estacionamientos y cocheras

| Metodo | Ruta                                             | Acceso      | Descripcion                              |
| ------ | ------------------------------------------------ | ----------- | ---------------------------------------- |
| GET    | `/api/estacionamientos`                          | publico     | Busqueda de publicados y activos         |
| GET    | `/api/estacionamientos/:id`                      | publico     | Detalle con horarios y cocheras          |
| GET    | `/api/estacionamientos/:id/cocheras`             | publico     | Cocheras del estacionamiento             |
| GET    | `/api/estacionamientos/:id/disponibilidad`       | publico     | Franjas de un dia con cocheras libres    |
| GET    | `/api/estacionamientos/mios`                     | PROPIETARIO | Los del propietario autenticado          |
| GET    | `/api/estacionamientos/:id/reservas`             | PROPIETARIO | Reservas recibidas (`?fecha=YYYY-MM-DD`) |
| POST   | `/api/estacionamientos`                          | PROPIETARIO | Alta (queda vinculado a su id)           |
| PATCH  | `/api/estacionamientos/:id`                      | PROPIETARIO | Modifica datos, horarios y publicacion   |
| DELETE | `/api/estacionamientos/:id`                      | PROPIETARIO | Baja logica en cascada                   |
| POST   | `/api/estacionamientos/:id/cocheras`             | PROPIETARIO | Alta de cochera (valida propiedad)       |
| PATCH  | `/api/estacionamientos/:id/cocheras/:idCochera`  | PROPIETARIO | Modifica identificador, tipo o estado    |
| DELETE | `/api/estacionamientos/:id/cocheras/:idCochera`  | PROPIETARIO | Baja logica (`activo = false`)           |
| GET    | `/api/estacionamientos/:id/foto`                 | publico     | La foto subida (404 si no tiene)         |
| PUT    | `/api/estacionamientos/:id/foto`                 | PROPIETARIO | Sube o reemplaza la foto (JPG/PNG/WEBP, hasta 2 MB) |
| DELETE | `/api/estacionamientos/:id/foto`                 | PROPIETARIO | Quita la foto                            |

Filtros de busqueda: `q` (nombre, direccion, barrio o descripcion), `zona`,
`id_tipo_vehiculo`, `tarifa_max`, `cubierto` (`true`/`false`), `limit`
(1-100, default 20), `offset`.

Los listados y el detalle traen tambien `cocheras_activas`, `cocheras_libres`
(libres en este momento), `tipos_vehiculo` (ids admitidos) y `horarios`.

```jsonc
// POST /api/estacionamientos
{ "nombre": "Cochera Centro", "descripcion": "Subsuelo con vigilancia",
  "calle": "Av. Corrientes", "numero": "1234", "ciudad": "CABA",
  "provincia": "Buenos Aires", "codigo_postal": "C1043",
  "barrio_zona": "Centro", "latitud": -34.6037, "longitud": -58.3816,
  "telefono_contacto": "1155667788", "email_contacto": "contacto@centro.com",
  "tarifa_hora": 1500.5, "cubierto": true, "publicado": true,
  "horarios": [ { "dia_semana": 1, "hora_apertura": "08:00", "hora_cierre": "20:00" } ] }

// PATCH /api/estacionamientos/:id  (al menos un campo; los horarios se reemplazan)
{ "tarifa_hora": 1800, "publicado": false }

// POST /api/estacionamientos/:id/cocheras
// El front solo pide un numero ("1", "2"...); la API sigue aceptando texto
// libre de hasta 20 caracteres para no invalidar los datos ya cargados.
{ "identificador": "1", "id_tipo_vehiculo": 1, "sector": "Primer piso", "cubierta": true,
  "estado_actual": "LIBRE" }

// PATCH /api/estacionamientos/:id/cocheras/:idCochera  (al menos un campo)
{ "estado_actual": "OCUPADA" }

// PUT /api/estacionamientos/:id/foto
// Body binario, no JSON: el archivo tal cual, con su Content-Type
// (image/jpeg, image/png o image/webp), hasta 2 MB.

// GET /api/estacionamientos/:id/disponibilidad?fecha=2026-09-15&id_tipo_vehiculo=1
{ "fecha": "2026-09-15",
  "franjas": [ { "hora_desde": "08:00", "hora_hasta": "10:00",
                 "inicio": "2026-09-15T11:00:00.000Z", "fin": "2026-09-15T13:00:00.000Z",
                 "disponible": true, "cocheras_libres": 4, "motivo": null } ] }
```

`publicado` controla si aparece en la busqueda: ponerlo en `false` lo saca del
listado sin perder nada. El `DELETE` es la baja definitiva: cancela las reservas
que todavia no empezaron, desactiva las cocheras y deja el estacionamiento en
`activo = false` (las reservas historicas se conservan).

`motivo` explica por que una franja no se puede reservar: fuera del horario de
atencion, ya empezo o no quedan cocheras libres.

### Vehiculos y reservas

| Metodo | Ruta                        | Acceso    | Descripcion                          |
| ------ | --------------------------- | --------- | ------------------------------------ |
| GET    | `/api/vehiculos/tipos`      | publico   | Catalogo de tipos de vehiculo        |
| POST   | `/api/vehiculos`            | CONDUCTOR | Registra un vehiculo                 |
| GET    | `/api/vehiculos`            | CONDUCTOR | Sus vehiculos                        |
| POST   | `/api/reservas`             | CONDUCTOR | Crea una reserva                     |
| GET    | `/api/reservas`             | CONDUCTOR | Sus reservas                         |
| PATCH  | `/api/reservas/:id/cancelar`| CONDUCTOR | Cancela una reserva propia vigente   |
| PATCH  | `/api/reservas/:id/confirmar`| PROPIETARIO | Acepta una reserva pendiente       |
| PATCH  | `/api/reservas/:id/ingreso` | PROPIETARIO | Registra la llegada del vehiculo   |
| PATCH  | `/api/reservas/:id/egreso`  | PROPIETARIO | Registra la salida y la finaliza   |

```jsonc
// POST /api/vehiculos
{ "patente": "AB123CD", "id_tipo_vehiculo": 1, "marca": "Toyota",
  "modelo": "Corolla", "color": "Gris", "predeterminado": true }
```

El primer vehiculo de un conductor queda como predeterminado. Si se registra
otro con `"predeterminado": true`, pasa a serlo y el anterior deja de serlo.

```jsonc
// POST /api/reservas  (lo que usa la app: el backend asigna la cochera)
{ "id_estacionamiento": "uuid", "id_vehiculo": "uuid",
  "inicio": "2026-09-10T14:00:00-03:00", "fin": "2026-09-10T18:00:00-03:00" }

// Alternativa: reservar una cochera puntual
{ "id_cochera": "uuid", "id_vehiculo": "uuid",
  "inicio": "2026-09-10T14:00:00-03:00", "fin": "2026-09-10T18:00:00-03:00" }
```

Tiene que venir `id_estacionamiento` **o** `id_cochera`. La reserva exige que el
vehiculo sea del conductor, este activo y no tenga otra reserva vigente que se
superponga; que la cochera admita su tipo; que `inicio` no este en el pasado y
que la franja caiga dentro del horario de atencion de ese dia (si el
estacionamiento tiene horarios cargados).

Las reservas se devuelven con el detalle resuelto: patente, cochera,
estacionamiento, `precio_total` (horas × tarifa) y nombre del conductor.

#### Ciclo de la reserva

```
PENDIENTE --confirmar--> CONFIRMADA --ingreso--> EN_CURSO --egreso--> FINALIZADA
     |                        |
     +--------cancelar--------+--> CANCELADA
```

Las tres transiciones las hace el **propietario de la cochera**; el conductor
solo cancela, y puede hacerlo hasta que se registre el ingreso.

- **`EN_CURSO` no existe en la base:** es una reserva `CONFIRMADA` con
  `ingreso_real` cargado. El `SELECT` lo resuelve, asi que los EXCLUDE de
  solapamiento siguen mirando `PENDIENTE`/`CONFIRMADA` sin cambios.
- El **ingreso** se acepta desde 30 minutos antes de `inicio` hasta `fin`, y
  deja la cochera en `OCUPADA`.
- El **egreso** guarda `egreso_real`, pasa la reserva a `FINALIZADA` y devuelve
  la cochera a `LIBRE`. Se puede registrar aunque la franja ya haya terminado.

### Formato de errores

Todos los errores salen con la misma forma:

```jsonc
{ "error": {
    "message": "Datos invalidos",
    "details": [ { "campo": "email", "mensaje": "no tiene formato de email" } ] } }
```

`400` validacion · `401` sin token o credenciales invalidas · `403` rol o
propiedad incorrecta · `404` inexistente · `409` conflicto (email/patente/
identificador duplicado, solapamiento, sin lugar, fuera de horario) · `500` inesperado.

---

## Reservas sin solapamiento

Es la parte critica: dos conductores no pueden reservar la misma cochera en
franjas que se pisan. Hay dos capas de defensa.

**1. Transaccion en `src/services/reserva.service.js`**

```
BEGIN
  SELECT ... FROM vehiculo WHERE id_vehiculo = $1 FOR UPDATE           -- (a)
  validar vehiculo del conductor y que no tenga reservas superpuestas
  -- con id_cochera:
  SELECT ... FROM cochera c WHERE c.id_cochera = $1 FOR UPDATE OF c   -- (a)
  -- con id_estacionamiento:
  SELECT ... FROM cochera c WHERE <compatibles> ORDER BY id FOR UPDATE -- (a)
  SELECT 1 FROM reserva                                                -- (b)
   WHERE id_cochera = c.id_cochera
     AND estado = ANY('{PENDIENTE,CONFIRMADA}')
     AND inicio < $fin AND fin > $inicio
  validar horario de atencion
  INSERT INTO reserva ...
COMMIT
```

- **(a)** El lock va sobre las filas de `COCHERA`, no sobre las reservas.
  Bloquear las reservas existentes no alcanzaria: dos transacciones simultaneas
  no verian las filas que la otra esta por insertar (phantom read). Al tomar el
  lock sobre la cochera, el segundo pedido espera el commit del primero y recien
  despues evalua el solapamiento.
- En la **asignacion automatica** se bloquean todas las cocheras compatibles,
  siempre en el mismo orden, y se toma la primera libre. El segundo pedido
  simultaneo ve la reserva del primero y elige otra cochera; si no queda
  ninguna recibe `409`. El orden fijo evita deadlocks.
- **(b)** Dos intervalos `[a, b)` y `[c, d)` se solapan si `a < d AND b > c`.
  Esto cubre solapamiento exacto, parcial de cada lado, contenido y continente.
  Una reserva que arranca justo cuando termina otra **no** se considera
  solapada (limite abierto a derecha).
- Solo cuentan los estados **PENDIENTE** y **CONFIRMADA**; las CANCELADA y
  FINALIZADA liberan la franja.
- **El vehiculo tampoco puede estar en dos lugares a la vez.** Su fila se
  bloquea al empezar (siempre antes que las cocheras, para que el orden de
  bloqueo sea fijo) y el EXCLUDE `reserva_vehiculo_sin_solapamiento` repite la
  regla en la base, aunque las reservas sean en cocheras distintas.

**2. Constraint en la base (`schema.sql`)**

```sql
ALTER TABLE reserva ADD CONSTRAINT reserva_sin_solapamiento
  EXCLUDE USING gist (
    id_cochera WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
  ) WHERE (estado IN ('PENDIENTE', 'CONFIRMADA'));
```

Garantiza la invariante aunque alguien escriba por fuera de la API. Si la
extension `btree_gist` no esta disponible, la migracion emite un NOTICE y sigue:
la validacion transaccional se mantiene.

---

## Alcance del Sprint 1

- [x] Nombre de la aplicacion: **Parkit** (UCAio es la software factory)
- [x] Registro y login con roles Conductor y Propietario
- [x] ABM de estacionamientos con nombre, direccion, horarios y contacto
- [x] ABM de cocheras con identificador y tipo de vehiculo admitido
- [x] Registro de vehiculos del conductor
- [x] Consulta de estacionamientos publicados
- [x] Creacion de reservas con vehiculo, fecha y franja horaria
- [x] Ciclo de la reserva: confirmar, ingreso, egreso y finalizacion

Pendiente: tiempo real con Socket.IO, busqueda por cercania, metricas y
normalizacion de `EXCEPCION`.
