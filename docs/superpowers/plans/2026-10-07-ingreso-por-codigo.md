# Ingreso y egreso por código o QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El conductor registra su ingreso y egreso escaneando el QR del estacionamiento (o tipeando su código), y el propietario ve, imprime y regenera ese QR.

**Architecture:** Cada estacionamiento tiene un `codigo_acceso` de 6 caracteres que genera la base (función SQL `generar_codigo_acceso()` como `DEFAULT`). Las reglas de ingreso y egreso se extraen de `registrarIngreso` y `registrarEgreso` a `aplicarIngreso` y `aplicarEgreso`, que comparten la entrada del propietario (por id de reserva, sin cambios) y la nueva del conductor (por código). El QR codifica la URL `/conductor/acceso/<codigo>`, así que la cámara del celular abre la app directo y no hace falta un lector dentro de la app.

**Tech Stack:**
- Back: Node + Express + PostgreSQL (`pg`), pruebas con `node --test` contra la base de `DATABASE_URL`.
- Front: Angular 21 (standalone, signals, `rxResource`), Tailwind 4 y Vitest (`ng test`).
- Librería nueva: `qrcode`.

**Spec:** `docs/superpowers/specs/2026-10-07-ingreso-codigo-y-abonos-design.md` (Parte A)

## Global Constraints

- Alfabeto del código: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, largo 6.
- El código se muestra como `XXX-XXX`. Al validar se ignoran guiones, espacios y mayúsculas/minúsculas.
- `codigo_acceso` **nunca** aparece en `GET /estacionamientos` ni en `GET /estacionamientos/:id` (son públicos).
- La ventana de ingreso es la de hoy: desde `inicio - MARGEN_INGRESO_MS` (30 min) hasta `fin`.
- Los endpoints del propietario `PATCH /reservas/:id/ingreso|egreso` no cambian su contrato.
- Mensajes al usuario en español rioplatense; en el back, sin tildes (como el resto de los mensajes de `ApiError`).
- Commits sin trailer `Co-Authored-By`. Rama: `feat/ingreso-codigo-y-abonos`.

## Review Focus

1. **Doble escaneo rápido** (el conductor toca dos veces o recarga la página): el segundo POST no tiene que registrar el egreso inmediatamente después del ingreso. Se cubre con un margen: un egreso por código dentro de los 60 s posteriores al ingreso responde 409 "Acabas de registrar el ingreso". Prueba en la Task 4.
2. **Reserva ACTIVA cuyo `fin` ya pasó** (el auto se quedó de más y el job todavía no la cerró): el código tiene que permitir el egreso igual. Prueba en la Task 4.
3. **Código de un estacionamiento dado de baja:** 404 con el mismo mensaje que un código inexistente, sin revelar que existió. Prueba en la Task 4.
4. **Formato basura** (`"' OR 1=1"`, 50 caracteres, `null`): 400 o 404, nunca 500. Prueba en la Task 4.
5. **Abrir el link sin sesión:** después del login tiene que volver a `/conductor/acceso/<codigo>`. `authGuard` ya agrega `?redirigir=`; la Task 7 verifica a mano que `ingresar.ts` lo respete.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `Back/src/db/schema.sql` | Función `generar_codigo_acceso()`, columna, relleno e índice único |
| `Back/src/utils/codigoAcceso.js` (nuevo) | `normalizarCodigo`: reglas puras del formato |
| `Back/src/services/estacionamiento.service.js` | `obtenerCodigoAcceso`, `regenerarCodigoAcceso` |
| `Back/src/services/reserva.service.js` | `aplicarIngreso`/`aplicarEgreso`, `previaAcceso`, `registrarAcceso` |
| `Back/src/controllers/*.controller.js`, `Back/src/routes/*.routes.js` | Endpoints |
| `Back/src/validators/reserva.validator.js` | `validarAcceso` |
| `Back/pruebas/codigo-acceso.test.mjs` (nuevo) | Pruebas puras de `normalizarCodigo` |
| `Back/pruebas/acceso.test.mjs` (nuevo) | Integración de todo el flujo |
| `Front/src/app/utils/codigo-acceso.util.ts` (+ spec) | `normalizarCodigo`, `formatearCodigo`, `urlDeAcceso` |
| `Front/src/app/models/reserva.model.ts`, `services/api/*` | Tipos y mapeo de la vista previa |
| `Front/src/app/services/reserva.service.ts`, `estacionamiento.service.ts` | Llamadas HTTP |
| `Front/src/app/components/estacionamiento/qr-acceso/` (nuevo) | Tarjeta del QR del propietario |
| `Front/src/app/pages/conductor/acceso/` (nuevo) | Pantalla de confirmación del conductor |
| `Front/src/app/pages/conductor/mis-reservas/` | Botón "Tengo un código" |

---

### Task 1: Código de acceso en la base

**Files:**
- Modify: `Back/src/db/schema.sql` (al final)
- Create: `Back/src/utils/codigoAcceso.js`
- Test: `Back/pruebas/codigo-acceso.test.mjs`

**Interfaces:**
- Produces:
  - Columna `estacionamiento.codigo_acceso VARCHAR(6) NOT NULL UNIQUE`, con `DEFAULT generar_codigo_acceso()`.
  - Función SQL `generar_codigo_acceso() RETURNS VARCHAR(6)`.
  - `normalizarCodigo(bruto: unknown): string | null`.
  - `ALFABETO_CODIGO: string`.

- [ ] **Step 1: Escribir la prueba que falla**

`Back/pruebas/codigo-acceso.test.mjs`:

```js
// Codigo de acceso del estacionamiento: reglas puras de formato. No usa la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizarCodigo } from '../src/utils/codigoAcceso.js';

describe('normalizarCodigo', () => {
  test('acepta el codigo tal cual', () => {
    assert.equal(normalizarCodigo('K7M2QX'), 'K7M2QX');
  });

  test('ignora guion, espacios y minusculas', () => {
    assert.equal(normalizarCodigo(' k7m-2qx '), 'K7M2QX');
    assert.equal(normalizarCodigo('k7m 2qx'), 'K7M2QX');
  });

  test('rechaza caracteres ambiguos que no estan en el alfabeto', () => {
    assert.equal(normalizarCodigo('K7M2Q0'), null); // cero
    assert.equal(normalizarCodigo('K7M2QO'), null); // O
    assert.equal(normalizarCodigo('K7M2Q1'), null); // uno
    assert.equal(normalizarCodigo('K7M2QI'), null); // I
    assert.equal(normalizarCodigo('K7M2QL'), null); // L
  });

  test('rechaza largos distintos de 6 y valores que no son texto', () => {
    assert.equal(normalizarCodigo('K7M2Q'), null);
    assert.equal(normalizarCodigo('K7M2QXX'), null);
    assert.equal(normalizarCodigo("' OR 1=1"), null);
    assert.equal(normalizarCodigo(null), null);
    assert.equal(normalizarCodigo(123456), null);
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd Back && node --test pruebas/codigo-acceso.test.mjs`
Expected: FAIL con `Cannot find module '../src/utils/codigoAcceso.js'`

- [ ] **Step 3: Implementar el util**

`Back/src/utils/codigoAcceso.js`:

```js
// Codigo de acceso del estacionamiento: el que figura debajo del QR de la
// entrada. Lo genera la base (generar_codigo_acceso() en schema.sql); aca
// solo se valida lo que tipea o escanea el conductor.

/** Sin 0 O 1 I L, que se confunden al leerlos o dictarlos. Tiene que coincidir con schema.sql. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const REGEX_CODIGO = new RegExp(`^[${ALFABETO_CODIGO}]{6}$`);

/** Saca guiones y espacios y pasa a mayusculas. `null` si no tiene forma de codigo. */
export function normalizarCodigo(bruto) {
  if (typeof bruto !== 'string') return null;
  const limpio = bruto.replace(/[\s-]/g, '').toUpperCase();
  return REGEX_CODIGO.test(limpio) ? limpio : null;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd Back && node --test pruebas/codigo-acceso.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Migración**

Agregar al final de `Back/src/db/schema.sql`:

```sql
-- Codigo de acceso del estacionamiento: va debajo del QR que el propietario
-- pega en la entrada. El conductor lo escanea (o lo tipea) para registrar su
-- ingreso y su egreso. Sin 0 O 1 I L para que no se confundan; el alfabeto
-- tiene que coincidir con src/utils/codigoAcceso.js. Lo genera la base, asi
-- el INSERT de estacionamiento.service.js no cambia.
CREATE OR REPLACE FUNCTION generar_codigo_acceso() RETURNS VARCHAR(6) AS $$
DECLARE
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codigo TEXT := '';
BEGIN
  FOR i IN 1..6 LOOP
    codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN codigo;
END
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE estacionamiento
  ADD COLUMN IF NOT EXISTS codigo_acceso VARCHAR(6);

-- Relleno de los estacionamientos que ya existen. Con 31^6 combinaciones, una
-- colision entre unos cientos de filas es practicamente imposible; si pasara,
-- el CREATE UNIQUE INDEX de abajo falla y alcanza con volver a migrar.
UPDATE estacionamiento SET codigo_acceso = generar_codigo_acceso() WHERE codigo_acceso IS NULL;

ALTER TABLE estacionamiento
  ALTER COLUMN codigo_acceso SET DEFAULT generar_codigo_acceso(),
  ALTER COLUMN codigo_acceso SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS estacionamiento_codigo_acceso_unico
  ON estacionamiento (codigo_acceso);
```

- [ ] **Step 6: Aplicar la migración dos veces (es idempotente) y verificar**

Run: `cd Back && npm run db:migrate && npm run db:migrate`
Expected: dos veces `[migrate] listo`, sin errores.

Run: `cd Back && node --env-file=.env -e "import('./src/config/database.js').then(async ({query,pool})=>{const r=await query('SELECT count(*) FILTER (WHERE codigo_acceso IS NULL) AS nulos, count(DISTINCT codigo_acceso) = count(*) AS unicos FROM estacionamiento');console.log(r.rows[0]);await pool.end()})"`
Expected: `{ nulos: '0', unicos: true }`

- [ ] **Step 7: Correr toda la suite (nada debería romperse)**

Run: `cd Back && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add Back/src/db/schema.sql Back/src/utils/codigoAcceso.js Back/pruebas/codigo-acceso.test.mjs
git commit -m "Codigo de acceso por estacionamiento generado en la base"
```

---

### Task 2: El propietario ve y regenera el código

**Files:**
- Modify: `Back/src/services/estacionamiento.service.js` (agregar después de `asegurarPropiedad`)
- Modify: `Back/src/controllers/estacionamiento.controller.js`
- Modify: `Back/src/routes/estacionamiento.routes.js` (antes de `router.get('/:id', ...)` no hace falta: las rutas nuevas tienen un segmento más)
- Test: `Back/pruebas/acceso.test.mjs` (nuevo)

**Interfaces:**
- Consumes: la columna `codigo_acceso` y `generar_codigo_acceso()` (Task 1), y `asegurarPropiedad(idEstacionamiento, idPropietario)` (existente).
- Produces:
  - `GET /api/estacionamientos/:id/codigo-acceso` → `200 { codigo_acceso: string }` (solo el propietario dueño).
  - `POST /api/estacionamientos/:id/codigo-acceso/regenerar` → `200 { codigo_acceso: string }`.
  - Servicio: `obtenerCodigoAcceso(id, idPropietario): Promise<string>` y `regenerarCodigoAcceso(id, idPropietario): Promise<string>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`Back/pruebas/acceso.test.mjs`:

```js
// Ingreso y egreso por codigo de acceso del estacionamiento (QR de la entrada).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  ponerEnCurso,
  query,
} from './ayuda.mjs';

before(() => levantarApi('acceso'));
after(() => cerrarApi());

const codigoDe = async (propietario, estacionamiento) => {
  const { datos } = await api(
    'GET',
    `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso`,
    { token: propietario.token },
  );
  return datos.codigo_acceso;
};

describe('codigo de acceso del estacionamiento', () => {
  test('el propietario lo ve y tiene el formato esperado', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado, datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso`,
      { token: propietario.token },
    );

    assert.equal(estado, 200);
    assert.match(datos.codigo_acceso, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  test('no aparece en el detalle ni en la busqueda publicos', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const detalle = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}`);
    assert.equal(detalle.datos.estacionamiento.codigo_acceso, undefined);

    const busqueda = await api('GET', '/estacionamientos');
    assert.ok(busqueda.datos.estacionamientos.every((e) => e.codigo_acceso === undefined));

    const mios = await api('GET', '/estacionamientos/mios', { token: propietario.token });
    assert.ok(mios.datos.estacionamientos.every((e) => e.codigo_acceso === undefined));
  });

  test('otro propietario no lo puede ver ni regenerar', async () => {
    const duenio = await crearUsuario({ rol: 'PROPIETARIO' });
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(duenio.token);
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso`;

    assert.equal((await api('GET', ruta, { token: otro.token })).estado, 403);
    assert.equal((await api('POST', `${ruta}/regenerar`, { token: otro.token })).estado, 403);
  });

  test('un conductor no lo puede ver', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const conductor = await crearUsuario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso`,
      { token: conductor.token },
    );
    assert.equal(estado, 403);
  });

  test('regenerar da un codigo distinto y deja guardado el nuevo', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const anterior = await codigoDe(propietario, estacionamiento);

    const { estado, datos } = await api(
      'POST',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso/regenerar`,
      { token: propietario.token },
    );

    assert.equal(estado, 200);
    assert.notEqual(datos.codigo_acceso, anterior);
    assert.equal(await codigoDe(propietario, estacionamiento), datos.codigo_acceso);
  });
});
```

(`crearVehiculo`, `franja`, `motivo`, `ponerEnCurso` y `query` se usan en la Task 4. Si el linter se queja de imports sin usar, agregalos recién en la Task 4.)

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: FAIL. Las rutas no existen y responden 404.

- [ ] **Step 3: Servicio**

En `Back/src/services/estacionamiento.service.js`, debajo de `asegurarPropiedad`:

```js
const VIOLACION_UNIQUE = '23505';

/** Codigo que va debajo del QR de la entrada. Solo lo ve el dueño: con el, se registra el ingreso. */
export async function obtenerCodigoAcceso(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    'SELECT codigo_acceso FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );
  return rows[0].codigo_acceso;
}

/**
 * Cambia el codigo (por ejemplo, si se filtro una foto del cartel); el
 * anterior deja de funcionar. Una colision con otro estacionamiento es casi
 * imposible, pero si pasa se reintenta con otro codigo.
 */
export async function regenerarCodigoAcceso(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  for (let intento = 0; ; intento++) {
    try {
      const { rows } = await query(
        `UPDATE estacionamiento SET codigo_acceso = generar_codigo_acceso()
          WHERE id_estacionamiento = $1
          RETURNING codigo_acceso`,
        [idEstacionamiento],
      );
      return rows[0].codigo_acceso;
    } catch (error) {
      if (error.code !== VIOLACION_UNIQUE || intento >= 2) throw error;
    }
  }
}
```

(La prueba "regenerar da un codigo distinto" puede fallar 1 de cada 887 millones de veces. Es aceptable.)

- [ ] **Step 4: Controlador y rutas**

En `Back/src/controllers/estacionamiento.controller.js`, después de `listarMios`:

```js
export const obtenerCodigoAcceso = asyncHandler(async (req, res) => {
  const codigo_acceso = await estacionamientoService.obtenerCodigoAcceso(req.params.id, req.usuario.id);
  res.json({ codigo_acceso });
});

export const regenerarCodigoAcceso = asyncHandler(async (req, res) => {
  const codigo_acceso = await estacionamientoService.regenerarCodigoAcceso(req.params.id, req.usuario.id);
  res.json({ codigo_acceso });
});
```

En `Back/src/routes/estacionamiento.routes.js`, después del `router.get('/:id/reservas', ...)`:

```js
// Codigo del QR de la entrada: solo el dueño lo ve y lo puede cambiar.
router.get('/:id/codigo-acceso', ...soloPropietario, estacionamientoController.obtenerCodigoAcceso);
router.post(
  '/:id/codigo-acceso/regenerar',
  ...soloPropietario,
  estacionamientoController.regenerarCodigoAcceso,
);
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: PASS (5 tests). Si "otro propietario" devuelve 404 en vez de 403, revisá que el estacionamiento exista: `asegurarPropiedad` devuelve 403 para uno ajeno.

- [ ] **Step 6: Commit**

```bash
git add Back/src/services/estacionamiento.service.js Back/src/controllers/estacionamiento.controller.js Back/src/routes/estacionamiento.routes.js Back/pruebas/acceso.test.mjs
git commit -m "El propietario ve y regenera el codigo de acceso de su estacionamiento"
```

---

### Task 3: Separar las reglas de ingreso y egreso

Es un refactor sin cambio de comportamiento: las pruebas existentes de "ciclo de la reserva" son la red de seguridad.

**Files:**
- Modify: `Back/src/services/reserva.service.js:469-505`

**Interfaces:**
- Produces (internas del módulo):
  - `aplicarIngreso(client, reserva): Promise<void>`.
  - `aplicarEgreso(client, reserva): Promise<void>`.
  - `reserva` es una fila bloqueada con al menos `id_reserva, estado, inicio, fin, ingreso_real, egreso_real, id_cochera`.
  - `MARGEN_EGRESO_TRAS_INGRESO_MS = 60_000`.

- [ ] **Step 1: Verificar el punto de partida**

Run: `cd Back && node --test --env-file=.env pruebas/reserva.test.mjs`
Expected: PASS

- [ ] **Step 2: Reemplazar `registrarIngreso` y `registrarEgreso`**

En `Back/src/services/reserva.service.js`, reemplazar las dos funciones desde `/** Llego el vehiculo:` hasta el cierre de `registrarEgreso` por:

```js
/**
 * Un egreso pegado al ingreso es casi seguro un doble escaneo del QR (o una
 * recarga de la pagina), no un auto que entro y salio: se rechaza.
 */
const MARGEN_EGRESO_TRAS_INGRESO_MS = 60 * 1000;

/**
 * Reglas del ingreso sobre una reserva ya bloqueada. Las comparten el
 * propietario (registrarIngreso) y el conductor por codigo (registrarAcceso).
 */
async function aplicarIngreso(client, reserva) {
  if (reserva.estado === ESTADOS_RESERVA.PENDIENTE) {
    throw ApiError.conflict('Primero hay que confirmar la reserva');
  }
  if (reserva.ingreso_real) throw ApiError.conflict('El ingreso ya estaba registrado');

  const ahora = Date.now();
  if (ahora < reserva.inicio.getTime() - MARGEN_INGRESO_MS) {
    throw ApiError.conflict('Todavia es muy temprano para registrar el ingreso');
  }
  if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');

  await client.query('UPDATE reserva SET ingreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.ACTIVA);
}

/** Reglas del egreso sobre una reserva ya bloqueada. */
async function aplicarEgreso(client, reserva) {
  if (!reserva.ingreso_real) throw ApiError.conflict('La reserva todavia no tiene ingreso');
  if (reserva.egreso_real) throw ApiError.conflict('El egreso ya estaba registrado');

  await client.query('UPDATE reserva SET egreso_real = now() WHERE id_reserva = $1', [reserva.id_reserva]);
  await cambiarEstado(client, reserva, ESTADOS_RESERVA.FINALIZADA);
}

/** Llego el vehiculo: se guarda la hora y la cochera pasa a OCUPADA. */
export async function registrarIngreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);
    await aplicarIngreso(client, reserva);
    return obtenerDetalle(client, idReserva);
  });
}

/** Se fue el vehiculo: la reserva queda FINALIZADA y la cochera libre. */
export async function registrarEgreso(idReserva, idPropietario) {
  return withTransaction(async (client) => {
    const reserva = await bloquearReservaDelPropietario(client, idReserva, idPropietario);
    await aplicarEgreso(client, reserva);
    return obtenerDetalle(client, idReserva);
  });
}
```

`MARGEN_EGRESO_TRAS_INGRESO_MS` se usa recién en la Task 4, y solo en el camino del conductor: el propietario sigue pudiendo registrar el egreso enseguida, como hoy, y sus pruebas lo hacen.

- [ ] **Step 3: Correr las pruebas y verificar que siguen pasando**

Run: `cd Back && node --test --env-file=.env pruebas/reserva.test.mjs`
Expected: PASS, con los mismos tests que en el Step 1.

- [ ] **Step 4: Commit**

```bash
git add Back/src/services/reserva.service.js
git commit -m "Separo las reglas de ingreso y egreso para reusarlas desde el codigo"
```

---

### Task 4: Ingreso y egreso del conductor por código

**Files:**
- Modify: `Back/src/services/reserva.service.js` (debajo de `registrarEgreso`)
- Modify: `Back/src/validators/reserva.validator.js`
- Modify: `Back/src/controllers/reserva.controller.js`
- Modify: `Back/src/routes/reserva.routes.js`
- Test: `Back/pruebas/acceso.test.mjs`

**Interfaces:**
- Consumes:
  - `aplicarIngreso`, `aplicarEgreso` y `MARGEN_EGRESO_TRAS_INGRESO_MS` (Task 3).
  - `normalizarCodigo` (Task 1).
  - `obtenerDetalle(ejecutor, idReserva)` (existente).
- Produces:
  - `GET /api/reservas/acceso/:codigo` (CONDUCTOR) → `200 { estacionamiento: { id_estacionamiento, nombre }, candidatas: [{ accion: 'INGRESO'|'EGRESO', reserva: <ReservaDto> }] }`.
  - `POST /api/reservas/acceso` (CONDUCTOR), body `{ codigo: string, id_reserva?: uuid }` → `200 { accion, reserva: <ReservaDto> }`.
  - Errores:
    - 404 para un código inexistente, mal formado o de un estacionamiento inactivo, y también si el conductor no tiene reservas vigentes ahí.
    - 409 si la reserva no está confirmada, si es demasiado temprano, si hay varias candidatas sin `id_reserva` o si se intenta el egreso justo después del ingreso.
    - 404 si `id_reserva` no está entre las candidatas.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `Back/pruebas/acceso.test.mjs`:

```js
/** Reserva CONFIRMADA de manana en un estacionamiento nuevo, con su codigo. */
async function escenario({ cocheras = 1 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const codigo = await codigoDe(propietario, estacionamiento);

  const reserva = await reservaConfirmada(propietario, conductor, estacionamiento, vehiculo);
  return { propietario, estacionamiento, conductor, vehiculo, codigo, reserva };
}

async function reservaConfirmada(propietario, conductor, estacionamiento, vehiculo, cuando = franja()) {
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...cuando,
    },
  });
  await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, { token: propietario.token });
  return datos.reserva;
}

const acceder = (conductor, body) => api('POST', '/reservas/acceso', { token: conductor.token, body });

const estadoCochera = async (idCochera) =>
  (await query('SELECT estado_actual FROM cochera WHERE id_cochera = $1', [idCochera])).rows[0]
    .estado_actual;

/** Corre el ingreso_real hacia atras para pasar el margen anti doble escaneo. */
const ingresoHaceUnRato = (idReserva) =>
  query(`UPDATE reserva SET ingreso_real = now() - interval '10 minutes' WHERE id_reserva = $1`, [
    idReserva,
  ]);

describe('ingreso y egreso del conductor por codigo', () => {
  test('ingreso en su franja: ACTIVA y cochera OCUPADA', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await acceder(conductor, { codigo });

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'INGRESO');
    assert.equal(datos.reserva.estado, 'ACTIVA');
    assert.ok(datos.reserva.ingreso_real);
    assert.equal(await estadoCochera(reserva.id_cochera), 'OCUPADA');
  });

  test('egreso con el mismo codigo: FINALIZADA y cochera LIBRE', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(conductor, { codigo });
    await ingresoHaceUnRato(reserva.id_reserva);

    const { estado, datos } = await acceder(conductor, { codigo });

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
    assert.equal(datos.reserva.estado, 'FINALIZADA');
    assert.equal(await estadoCochera(reserva.id_cochera), 'LIBRE');
  });

  test('doble escaneo: el segundo no registra el egreso enseguida', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(conductor, { codigo });

    const segundo = await acceder(conductor, { codigo });

    assert.equal(segundo.estado, 409);
    assert.match(motivo(segundo), /acabas de registrar el ingreso/i);
  });

  test('egreso aunque la franja ya haya terminado', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(conductor, { codigo });
    await query(
      `UPDATE reserva SET inicio = now() - interval '3 hours', fin = now() - interval '10 minutes',
              ingreso_real = now() - interval '3 hours'
        WHERE id_reserva = $1`,
      [reserva.id_reserva],
    );

    const { estado, datos } = await acceder(conductor, { codigo });

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
  });

  test('el codigo se acepta en minusculas y con guion', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const tipeado = `${codigo.slice(0, 3)}-${codigo.slice(3)}`.toLowerCase();
    const { estado } = await acceder(conductor, { codigo: tipeado });

    assert.equal(estado, 200);
  });

  test('vista previa: muestra la candidata sin registrar nada', async () => {
    const { conductor, codigo, reserva, estacionamiento } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await api('GET', `/reservas/acceso/${codigo}`, { token: conductor.token });

    assert.equal(estado, 200);
    assert.equal(datos.estacionamiento.id_estacionamiento, estacionamiento.id_estacionamiento);
    assert.equal(datos.candidatas.length, 1);
    assert.equal(datos.candidatas[0].accion, 'INGRESO');
    assert.equal(datos.candidatas[0].reserva.id_reserva, reserva.id_reserva);
    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [reserva.id_reserva]);
    assert.equal(rows[0].estado, 'CONFIRMADA');
  });

  test('codigo inexistente, mal formado o basura: 404, nunca 500', async () => {
    const conductor = await crearUsuario();

    for (const codigo of ['ZZZZZZ', 'K7M2Q0', "' OR 1=1", 'x'.repeat(50)]) {
      const respuesta = await acceder(conductor, { codigo });
      assert.ok([400, 404].includes(respuesta.estado), `${codigo}: ${respuesta.estado}`);
    }
    assert.equal((await acceder(conductor, {})).estado, 400);
  });

  test('codigo de un estacionamiento dado de baja: 404 igual que uno inexistente', async () => {
    const { conductor, codigo, reserva, estacionamiento } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await query('UPDATE estacionamiento SET activo = FALSE WHERE id_estacionamiento = $1', [
      estacionamiento.id_estacionamiento,
    ]);

    const respuesta = await acceder(conductor, { codigo });

    assert.equal(respuesta.estado, 404);
    assert.match(motivo(respuesta), /no corresponde a ningun estacionamiento/i);
  });

  test('codigo de otro estacionamiento: no tenes reserva vigente aca', async () => {
    const { conductor, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const otroDuenio = await crearUsuario({ rol: 'PROPIETARIO' });
    const otro = await crearEstacionamiento(otroDuenio.token);

    const respuesta = await acceder(conductor, { codigo: await codigoDe(otroDuenio, otro) });

    assert.equal(respuesta.estado, 404);
    assert.match(motivo(respuesta), /no tenes una reserva vigente/i);
  });

  test('reserva pendiente: todavia no fue confirmada', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...franja(),
      },
    });
    await ponerEnCurso(datos.reserva.id_reserva);

    const respuesta = await acceder(conductor, { codigo: await codigoDe(propietario, estacionamiento) });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /todavia no fue confirmada/i);
  });

  test('demasiado temprano: dice desde que hora puede ingresar', async () => {
    const { conductor, codigo } = await escenario(); // la franja es manana de 08:00 a 10:00

    const respuesta = await acceder(conductor, { codigo });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /empieza a las 08:00; podes ingresar desde las 07:30/i);
  });

  test('dos reservas en curso: pide elegir, y con id_reserva aplica sobre esa', async () => {
    const { propietario, estacionamiento, conductor, codigo, reserva } = await escenario({ cocheras: 2 });
    // Misma franja que la primera: asi el backend le asigna la otra cochera y
    // ponerEnCurso() no las superpone en la misma (lo impediria el EXCLUDE).
    const otroVehiculo = await crearVehiculo(conductor.token);
    const segunda = await reservaConfirmada(propietario, conductor, estacionamiento, otroVehiculo);
    await ponerEnCurso(reserva.id_reserva);
    await ponerEnCurso(segunda.id_reserva);

    const sinElegir = await acceder(conductor, { codigo });
    assert.equal(sinElegir.estado, 409);
    assert.match(motivo(sinElegir), /mas de una reserva/i);

    const previa = await api('GET', `/reservas/acceso/${codigo}`, { token: conductor.token });
    assert.equal(previa.datos.candidatas.length, 2);

    const elegida = await acceder(conductor, { codigo, id_reserva: segunda.id_reserva });
    assert.equal(elegida.estado, 200);
    assert.equal(elegida.datos.reserva.id_reserva, segunda.id_reserva);
  });

  test('id_reserva de otra persona: 404', async () => {
    const { conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const ajena = await escenario();

    const respuesta = await acceder(conductor, { codigo, id_reserva: ajena.reserva.id_reserva });

    assert.equal(respuesta.estado, 404);
  });

  test('despues de regenerar, el codigo anterior deja de funcionar', async () => {
    const { propietario, estacionamiento, conductor, codigo, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await api(
      'POST',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/codigo-acceso/regenerar`,
      { token: propietario.token },
    );

    assert.equal((await acceder(conductor, { codigo })).estado, 404);
    assert.equal(
      (await acceder(conductor, { codigo: await codigoDe(propietario, estacionamiento) })).estado,
      200,
    );
  });

  test('un propietario no puede usar el endpoint del conductor', async () => {
    const { propietario, codigo } = await escenario();
    assert.equal((await acceder(propietario, { codigo })).estado, 403);
  });
});
```

Nota sobre la prueba "demasiado temprano": `franja()` arma la franja de mañana a las 08:00 en hora argentina, así que el mensaje tiene que formatear la hora en `America/Argentina/Buenos_Aires`, no en la zona del servidor.

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: los 5 tests de la Task 2 pasan y los nuevos fallan con 404 (la ruta no existe).

- [ ] **Step 3: Servicio**

En `Back/src/services/reserva.service.js`, agregar el import:

```js
import { normalizarCodigo } from '../utils/codigoAcceso.js';
```

Y debajo de `registrarEgreso`:

```js
/* --------------------- ingreso y egreso por codigo -----------------------
   El conductor escanea el QR de la entrada (o tipea el codigo) y el sistema
   decide que registrar segun su reserva en ese estacionamiento: el egreso si
   ya esta adentro (ACTIVA), o el ingreso si esta CONFIRMADA y en su franja.
-------------------------------------------------------------------------- */

const ACCIONES_ACCESO = Object.freeze({ INGRESO: 'INGRESO', EGRESO: 'EGRESO' });

const HORA_LOCAL = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Mismo mensaje para codigo inexistente, mal formado o de un estacionamiento dado de baja. */
const CODIGO_INVALIDO = 'El codigo no corresponde a ningun estacionamiento';

async function buscarEstacionamientoPorCodigo(ejecutor, bruto) {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) throw ApiError.notFound(CODIGO_INVALIDO);

  const { rows } = await ejecutor.query(
    `SELECT id_estacionamiento, nombre FROM estacionamiento
      WHERE codigo_acceso = $1 AND activo`,
    [codigo],
  );
  if (!rows[0]) throw ApiError.notFound(CODIGO_INVALIDO);
  return rows[0];
}

/**
 * Reservas vigentes del conductor en el estacionamiento. Una ACTIVA entra
 * aunque su `fin` haya pasado: el auto sigue adentro hasta que registre el
 * egreso (o lo cierre el job).
 */
async function reservasDelConductorEn(ejecutor, idEstacionamiento, idConductor, { bloquear = false } = {}) {
  const { rows } = await ejecutor.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real, r.id_cochera
       FROM reserva r
       JOIN cochera c ON c.id_cochera = r.id_cochera
      WHERE c.id_estacionamiento = $1
        AND r.id_conductor = $2
        AND r.estado = ANY($3::estado_reserva[])
        AND (r.estado = $4 OR r.fin > now())
      ORDER BY r.inicio
      ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [idEstacionamiento, idConductor, ESTADOS_VIGENTES, ESTADOS_RESERVA.ACTIVA],
  );
  return rows;
}

/** Que se registraria ahora sobre esta reserva, o null si no le toca nada. */
function accionPara(reserva, ahora = Date.now()) {
  if (reserva.estado === ESTADOS_RESERVA.ACTIVA) return ACCIONES_ACCESO.EGRESO;
  if (
    reserva.estado === ESTADOS_RESERVA.CONFIRMADA &&
    ahora >= reserva.inicio.getTime() - MARGEN_INGRESO_MS &&
    ahora <= reserva.fin.getTime()
  ) {
    return ACCIONES_ACCESO.INGRESO;
  }
  return null;
}

/** El error mas util cuando ninguna reserva tiene accion: explica por que. */
function errorSinCandidatas(reservas) {
  const proxima = reservas.find((r) => r.estado === ESTADOS_RESERVA.CONFIRMADA);
  if (proxima) {
    const desde = new Date(proxima.inicio.getTime() - MARGEN_INGRESO_MS);
    return ApiError.conflict(
      `Tu reserva empieza a las ${HORA_LOCAL.format(proxima.inicio)}; ` +
        `podes ingresar desde las ${HORA_LOCAL.format(desde)}`,
    );
  }
  if (reservas.some((r) => r.estado === ESTADOS_RESERVA.PENDIENTE)) {
    return ApiError.conflict('Tu reserva todavia no fue confirmada por el estacionamiento');
  }
  return ApiError.notFound('No tenes una reserva vigente en este estacionamiento');
}

function candidatasDe(reservas) {
  return reservas
    .map((reserva) => ({ reserva, accion: accionPara(reserva) }))
    .filter(({ accion }) => accion !== null);
}

/** Vista previa para la pantalla de confirmacion: no registra nada. */
export async function previaAcceso(idConductor, codigo) {
  const estacionamiento = await buscarEstacionamientoPorCodigo({ query }, codigo);
  const reservas = await reservasDelConductorEn({ query }, estacionamiento.id_estacionamiento, idConductor);

  const candidatas = candidatasDe(reservas);
  if (candidatas.length === 0) throw errorSinCandidatas(reservas);

  return {
    estacionamiento,
    candidatas: await Promise.all(
      candidatas.map(async ({ reserva, accion }) => ({
        accion,
        reserva: await obtenerDetalle({ query }, reserva.id_reserva),
      })),
    ),
  };
}

/**
 * Registra el ingreso o el egreso. Vuelve a resolver la accion con la reserva
 * bloqueada: entre la vista previa y la confirmacion puede haber cambiado.
 */
export async function registrarAcceso(idConductor, { codigo, id_reserva }) {
  return withTransaction(async (client) => {
    const estacionamiento = await buscarEstacionamientoPorCodigo(client, codigo);
    const reservas = await reservasDelConductorEn(
      client, estacionamiento.id_estacionamiento, idConductor, { bloquear: true },
    );

    const candidatas = candidatasDe(reservas);
    if (candidatas.length === 0) throw errorSinCandidatas(reservas);

    let elegida;
    if (id_reserva) {
      elegida = candidatas.find(({ reserva }) => reserva.id_reserva === id_reserva);
      if (!elegida) throw ApiError.notFound('Esa reserva no se puede registrar con este codigo');
    } else if (candidatas.length === 1) {
      elegida = candidatas[0];
    } else {
      throw ApiError.conflict('Tenes mas de una reserva en este estacionamiento; elegi cual', {
        candidatas: candidatas.map(({ reserva }) => reserva.id_reserva),
      });
    }

    const { reserva, accion } = elegida;
    if (accion === ACCIONES_ACCESO.INGRESO) {
      await aplicarIngreso(client, reserva);
    } else {
      if (Date.now() - reserva.ingreso_real.getTime() < MARGEN_EGRESO_TRAS_INGRESO_MS) {
        throw ApiError.conflict('Acabas de registrar el ingreso; el egreso se marca al irte');
      }
      await aplicarEgreso(client, reserva);
    }

    return { accion, reserva: await obtenerDetalle(client, reserva.id_reserva) };
  });
}
```

`{ query }` funciona como "ejecutor" porque `obtenerDetalle` y las funciones nuevas solo llaman a `.query(...)`, igual que con el `client` de una transacción (ver el comentario de `obtenerDetalle`).

- [ ] **Step 4: Validador**

En `Back/src/validators/reserva.validator.js`, al final:

```js
/** `POST /reservas/acceso`: el formato fino del codigo lo valida el servicio (404 si no existe). */
export function validarAcceso(body) {
  return campos(body)
    .texto('codigo', body.codigo, { max: 20 })
    .uuid('id_reserva', body.id_reserva, { requerido: false })
    .resultado();
}
```

- [ ] **Step 5: Controlador y rutas**

En `Back/src/controllers/reserva.controller.js`, al final:

```js
export const previaAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.previaAcceso(req.usuario.id, req.params.codigo));
});

export const registrarAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.registrarAcceso(req.usuario.id, req.body));
});
```

En `Back/src/routes/reserva.routes.js`, cambiar el import del validador a `import { validarAcceso, validarReserva } from '../validators/reserva.validator.js';` y agregar después de `router.patch('/:id/cancelar', ...)`:

```js
// El conductor escanea el QR de la entrada (o tipea el codigo) al llegar y al irse.
router.get('/acceso/:codigo', ...soloConductor, reservaController.previaAcceso);
router.post('/acceso', ...soloConductor, validate(validarAcceso), reservaController.registrarAcceso);
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: PASS (todos)

- [ ] **Step 7: Correr toda la suite**

Run: `cd Back && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add Back/src/services/reserva.service.js Back/src/validators/reserva.validator.js Back/src/controllers/reserva.controller.js Back/src/routes/reserva.routes.js Back/pruebas/acceso.test.mjs
git commit -m "El conductor registra ingreso y egreso con el codigo del estacionamiento"
```

---

### Task 5: Front — util del código, modelos y servicios

**Files:**
- Create: `Front/src/app/utils/codigo-acceso.util.ts`
- Test: `Front/src/app/utils/codigo-acceso.util.spec.ts`
- Modify: `Front/src/app/models/reserva.model.ts` (al final)
- Modify: `Front/src/app/services/api/api.dto.ts` (después de `ReservaDto`)
- Modify: `Front/src/app/services/api/api.mapeo.ts` (después de `aReserva`)
- Modify: `Front/src/app/services/reserva.service.ts`
- Modify: `Front/src/app/services/estacionamiento.service.ts`

**Interfaces:**
- Consumes: los endpoints de las Tasks 2 y 4.
- Produces:
  - `normalizarCodigo(bruto: string): string | null`, `formatearCodigo(codigo: string): string` y `urlDeAcceso(codigo: string, origen?: string): string`.
  - Tipos `AccionAcceso`, `CandidataAcceso`, `PreviaAcceso` y `ResultadoAcceso`.
  - `ReservaService.previaAcceso(codigo): Observable<PreviaAcceso>` y `ReservaService.registrarAcceso(codigo, reservaId): Observable<ResultadoAcceso>`.
  - `EstacionamientoService.codigoAcceso(id): Observable<string>` y `EstacionamientoService.regenerarCodigoAcceso(id): Observable<string>`.

- [ ] **Step 1: Escribir la prueba que falla**

`Front/src/app/utils/codigo-acceso.util.spec.ts`:

```ts
import { formatearCodigo, normalizarCodigo, urlDeAcceso } from './codigo-acceso.util';

describe('normalizarCodigo', () => {
  it('ignora guion, espacios y minusculas', () => {
    expect(normalizarCodigo(' k7m-2qx ')).toBe('K7M2QX');
  });

  it('rechaza caracteres ambiguos y largos incorrectos', () => {
    expect(normalizarCodigo('K7M2Q0')).toBeNull();
    expect(normalizarCodigo('K7M2Q')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
  });
});

describe('formatearCodigo', () => {
  it('lo parte en dos para leerlo o dictarlo', () => {
    expect(formatearCodigo('K7M2QX')).toBe('K7M-2QX');
  });
});

describe('urlDeAcceso', () => {
  it('apunta a la pantalla del conductor', () => {
    expect(urlDeAcceso('K7M2QX', 'https://parkit.app')).toBe(
      'https://parkit.app/conductor/acceso/K7M2QX',
    );
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd Front && npx ng test --watch=false --include src/app/utils/codigo-acceso.util.spec.ts`
Expected: FAIL. No encuentra `./codigo-acceso.util`.

- [ ] **Step 3: Implementar el util**

`Front/src/app/utils/codigo-acceso.util.ts`:

```ts
/**
 * Codigo de acceso del estacionamiento (el que va debajo del QR de la
 * entrada). Mismo alfabeto que el backend: sin 0 O 1 I L.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REGEX_CODIGO = new RegExp(`^[${ALFABETO}]{6}$`);

/** Saca guiones y espacios y pasa a mayusculas. `null` si no tiene forma de codigo. */
export function normalizarCodigo(bruto: string): string | null {
  const limpio = bruto.replace(/[\s-]/g, '').toUpperCase();
  return REGEX_CODIGO.test(limpio) ? limpio : null;
}

/** `K7M2QX` -> `K7M-2QX`. */
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 3)}-${codigo.slice(3)}`;
}

/** URL que codifica el QR: la camara del celular abre la app directo en la confirmacion. */
export function urlDeAcceso(codigo: string, origen: string = globalThis.location.origin): string {
  return `${origen}/conductor/acceso/${codigo}`;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd Front && npx ng test --watch=false --include src/app/utils/codigo-acceso.util.spec.ts`
Expected: PASS

- [ ] **Step 5: Modelos, DTO y mapeo**

Al final de `Front/src/app/models/reserva.model.ts`:

```ts
/** Lo que registra el codigo del estacionamiento segun el estado de la reserva. */
export type AccionAcceso = 'INGRESO' | 'EGRESO';

export interface CandidataAcceso {
  accion: AccionAcceso;
  reserva: ReservaDetallada;
}

/** Vista previa de `GET /api/reservas/acceso/:codigo`: que se va a registrar, antes de confirmar. */
export interface PreviaAcceso {
  estacionamiento: { id: Id; nombre: string };
  candidatas: CandidataAcceso[];
}

export interface ResultadoAcceso {
  accion: AccionAcceso;
  reserva: ReservaDetallada;
}
```

En `Front/src/app/services/api/api.dto.ts`, después de `ReservaDto`:

```ts
export interface PreviaAccesoDto {
  estacionamiento: { id_estacionamiento: string; nombre: string };
  candidatas: { accion: 'INGRESO' | 'EGRESO'; reserva: ReservaDto }[];
}

export interface ResultadoAccesoDto {
  accion: 'INGRESO' | 'EGRESO';
  reserva: ReservaDto;
}
```

En `Front/src/app/services/api/api.mapeo.ts`, después de `aReserva`. Sumar `PreviaAcceso` al import de `@app/models` y `PreviaAccesoDto` al de `./api.dto`:

```ts
export function aPreviaAcceso(dto: PreviaAccesoDto): PreviaAcceso {
  return {
    estacionamiento: { id: dto.estacionamiento.id_estacionamiento, nombre: dto.estacionamiento.nombre },
    candidatas: dto.candidatas.map(({ accion, reserva }) => ({ accion, reserva: aReserva(reserva) })),
  };
}
```

- [ ] **Step 6: Servicios**

En `Front/src/app/services/reserva.service.ts`:
- Sumar `PreviaAcceso` y `ResultadoAcceso` al import de `@app/models`.
- Sumar `PreviaAccesoDto` y `ResultadoAccesoDto` al de `./api/api.dto`.
- Sumar `aPreviaAcceso` al de `./api/api.mapeo`.

Después agregar, debajo de `registrarEgreso`:

```ts
  /** `GET /api/reservas/acceso/:codigo`: que registraria el codigo, sin registrar nada. */
  previaAcceso(codigo: string): Observable<PreviaAcceso> {
    return this.http
      .get<PreviaAccesoDto>(`${this.ruta}/acceso/${codigo}`)
      .pipe(map(aPreviaAcceso));
  }

  /** `POST /api/reservas/acceso`: registra el ingreso o el egreso de esa reserva. */
  registrarAcceso(codigo: string, reservaId: Id): Observable<ResultadoAcceso> {
    return this.http
      .post<ResultadoAccesoDto>(`${this.ruta}/acceso`, { codigo, id_reserva: reservaId })
      .pipe(map(({ accion, reserva }) => ({ accion, reserva: aReserva(reserva) })));
  }
```

En `Front/src/app/services/estacionamiento.service.ts`, después de `listarDelPropietario`:

```ts
  /** `GET /api/estacionamientos/:id/codigo-acceso` (solo el dueño). */
  codigoAcceso(id: Id): Observable<string> {
    return this.http
      .get<{ codigo_acceso: string }>(`${this.ruta}/${id}/codigo-acceso`)
      .pipe(map(({ codigo_acceso }) => codigo_acceso));
  }

  /** `POST /api/estacionamientos/:id/codigo-acceso/regenerar`: el codigo anterior deja de andar. */
  regenerarCodigoAcceso(id: Id): Observable<string> {
    return this.http
      .post<{ codigo_acceso: string }>(`${this.ruta}/${id}/codigo-acceso/regenerar`, {})
      .pipe(map(({ codigo_acceso }) => codigo_acceso));
  }
```

- [ ] **Step 7: Compilar y correr los tests del front**

Run: `cd Front && npx ng build --configuration development && npx ng test --watch=false`
Expected: build sin errores y tests PASS.

- [ ] **Step 8: Commit**

```bash
git add Front/src/app/utils/codigo-acceso.util.ts Front/src/app/utils/codigo-acceso.util.spec.ts Front/src/app/models/reserva.model.ts Front/src/app/services
git commit -m "Front: tipos y servicios del ingreso por codigo"
```

---

### Task 6: Front — QR del propietario

**Files:**
- Create: `Front/src/app/components/estacionamiento/qr-acceso/qr-acceso.ts`
- Modify: `Front/src/app/components/estacionamiento/index.ts`
- Modify: `Front/src/app/pages/propietario/editar-estacionamiento/editar-estacionamiento.ts` y `.html`
- Modify: `Front/package.json` (dependencia `qrcode`)

**Interfaces:**
- Consumes: `EstacionamientoService.codigoAcceso` y `regenerarCodigoAcceso`; `formatearCodigo` y `urlDeAcceso` (Task 5).
- Produces: el componente `<app-qr-acceso [estacionamientoId]="..." [nombre]="..." />`.

- [ ] **Step 1: Instalar la librería**

Run: `cd Front && npm install qrcode && npm install -D @types/qrcode`
Expected: `package.json` y `package-lock.json` actualizados.

- [ ] **Step 2: Componente**

`Front/src/app/components/estacionamiento/qr-acceso/qr-acceso.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';
import { Boton, Cargando } from '@app/components/ui';
import { Id } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { formatearCodigo, urlDeAcceso } from '@app/utils/codigo-acceso.util';

/**
 * QR de la entrada del estacionamiento. El conductor lo escanea al llegar y
 * al irse; el propietario lo imprime y lo pega. Regenerar invalida el cartel
 * impreso, por eso pide confirmacion.
 */
@Component({
  selector: 'app-qr-acceso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando],
  template: `
    <section
      class="flex flex-col gap-4 rounded-tarjeta border border-borde bg-papel px-5 py-4 shadow-tarjeta"
      aria-labelledby="titulo-qr-acceso"
    >
      <div>
        <h2 id="titulo-qr-acceso" class="text-[14px] font-semibold text-tinta">QR de acceso</h2>
        <p class="mt-1 text-[13px] text-plomo">
          Pegalo en la entrada. Los conductores lo escanean al llegar y al irse para registrar su
          ingreso y su egreso.
        </p>
      </div>

      @if (qr.isLoading()) {
        <ui-cargando [cantidad]="1" />
      } @else if (qr.error(); as error) {
        <p class="text-[13px] text-ocupada" role="alert">{{ error.message }}</p>
      } @else if (qr.value(); as datos) {
        <div class="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
          <img [src]="datos.imagen" alt="QR de acceso" class="size-44 rounded-boton bg-white p-2" />
          <div class="flex flex-col items-center gap-3 sm:items-start">
            <p class="num-tabular text-[24px] font-semibold tracking-[0.12em] text-tinta">
              {{ datos.codigoVisible }}
            </p>
            <div class="flex flex-wrap gap-2">
              <ui-boton variante="primario" (presionado)="imprimir(datos.imagen, datos.codigoVisible)">
                Imprimir
              </ui-boton>
              @if (!confirmandoRegenerar()) {
                <ui-boton (presionado)="confirmandoRegenerar.set(true)">Regenerar código</ui-boton>
              }
            </div>
          </div>
        </div>

        @if (confirmandoRegenerar()) {
          <div class="flex flex-col gap-2 rounded-boton bg-ocupada/8 px-4 py-3" role="alert">
            <p class="text-[13px] text-tinta">
              El QR que ya imprimiste va a dejar de funcionar. ¿Generar uno nuevo?
            </p>
            <div class="flex gap-2">
              <ui-boton variante="primario" [cargando]="regenerando()" (presionado)="regenerar()">
                Sí, regenerar
              </ui-boton>
              <ui-boton (presionado)="confirmandoRegenerar.set(false)">Cancelar</ui-boton>
            </div>
          </div>
        }
      }
    </section>
  `,
})
export class QrAcceso {
  private readonly estacionamientos = inject(EstacionamientoService);

  readonly estacionamientoId = input.required<Id>();
  readonly nombre = input.required<string>();

  protected readonly confirmandoRegenerar = signal(false);
  protected readonly regenerando = signal(false);

  protected readonly qr = resource({
    params: () => this.estacionamientoId(),
    loader: async ({ params }) => {
      const codigo = await firstValueFrom(this.estacionamientos.codigoAcceso(params));
      return this.armar(codigo);
    },
  });

  protected regenerar(): void {
    this.regenerando.set(true);
    this.estacionamientos.regenerarCodigoAcceso(this.estacionamientoId()).subscribe({
      next: async (codigo) => {
        this.qr.set(await this.armar(codigo));
        this.regenerando.set(false);
        this.confirmandoRegenerar.set(false);
      },
      error: () => this.regenerando.set(false),
    });
  }

  /** Abre una hoja aparte solo con el cartel y lanza la impresion. */
  protected imprimir(imagen: string, codigoVisible: string): void {
    const hoja = window.open('', '_blank');
    if (!hoja) return;
    hoja.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>QR de acceso · ${this.nombre()}</title>
      <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 48px; }
        h1 { font-size: 28px; margin: 0 0 8px; }
        img { width: 360px; height: 360px; margin: 24px auto; display: block; }
        .codigo { font-size: 40px; font-weight: 700; letter-spacing: 0.15em; }
        p { font-size: 18px; color: #444; }
      </style></head><body>
      <h1>${this.nombre()}</h1>
      <p>Escaneá este código al llegar y al irte</p>
      <img src="${imagen}" alt="QR de acceso">
      <p>¿No funciona la cámara? Ingresá el código en la app:</p>
      <p class="codigo">${codigoVisible}</p>
      </body></html>`);
    hoja.document.close();
    hoja.onload = () => hoja.print();
  }

  private async armar(codigo: string) {
    const imagen = await QRCode.toDataURL(urlDeAcceso(codigo), { width: 512, margin: 1 });
    return { imagen, codigoVisible: formatearCodigo(codigo) };
  }
}
```

Nota: `this.nombre()` va dentro de `document.write`. Es el nombre del estacionamiento que cargó el mismo propietario, en su propia ventana, así que no es un vector de XSS hacia otros usuarios. Aun así, si el nombre trae `<`, se rompe el layout de la hoja: escapá con `.replace(/</g, '&lt;')`.

- [ ] **Step 3: Exportarlo y usarlo**

En `Front/src/app/components/estacionamiento/index.ts`, agregar:

```ts
export * from './qr-acceso/qr-acceso';
```

En `editar-estacionamiento.ts`, sumar `QrAcceso` al import de `@app/components/estacionamiento` y al array `imports` del componente.

En `editar-estacionamiento.html`, justo después del `</section>` de la sección `aria-labelledby="titulo-publicacion"` (dentro del `@else` del estacionamiento activo):

```html
        <app-qr-acceso [estacionamientoId]="estacionamiento.id" [nombre]="estacionamiento.nombre" />
```

- [ ] **Step 4: Compilar**

Run: `cd Front && npx ng build --configuration development`
Expected: sin errores.

- [ ] **Step 5: Probar a mano**

Levantar el back (`cd Back && npm run dev`) y el front (`cd Front && npm start`). Con un propietario, entrar a "Editar estacionamiento" y verificar:
- Se ve el QR con el código `XXX-XXX`.
- "Imprimir" abre la hoja con el nombre, el QR y el código.
- "Regenerar código" pide confirmación, y al confirmar cambia el código y el QR.
- Al escanear el QR con el celular, abre `http://<host>/conductor/acceso/<codigo>`. Para probar desde el celular en la red local, levantar con `npm start -- --host 0.0.0.0`.

- [ ] **Step 6: Commit**

```bash
git add Front/package.json Front/package-lock.json Front/src/app/components/estacionamiento Front/src/app/pages/propietario/editar-estacionamiento
git commit -m "QR de acceso del estacionamiento para imprimir y regenerar"
```

---

### Task 7: Front — pantalla del conductor y "Tengo un código"

**Files:**
- Create: `Front/src/app/pages/conductor/acceso/acceso.ts`
- Create: `Front/src/app/pages/conductor/acceso/acceso.html`
- Modify: `Front/src/app/app.routes.ts` (rama `conductor`, después de `mis-reservas`)
- Modify: `Front/src/app/pages/conductor/mis-reservas/mis-reservas.ts` y `.html`

**Interfaces:**
- Consumes: `ReservaService.previaAcceso` y `registrarAcceso`; `normalizarCodigo` y `formatearCodigo` (Task 5).
- Produces: la ruta `/conductor/acceso/:codigo`.

- [ ] **Step 1: Ruta**

En `Front/src/app/app.routes.ts`, dentro de `children` de `conductor`, después del bloque de `mis-reservas`:

```ts
      {
        // Destino del QR de la entrada del estacionamiento.
        path: 'acceso/:codigo',
        title: 'Parkit · Registrar acceso',
        loadComponent: () => import('./pages/conductor/acceso/acceso').then((m) => m.Acceso),
      },
```

- [ ] **Step 2: Componente**

`Front/src/app/pages/conductor/acceso/acceso.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { CandidataAcceso, ResultadoAcceso } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';
import { formatearCodigo, normalizarCodigo } from '@app/utils/codigo-acceso.util';

const TEXTO_ACCION = { INGRESO: 'Registrar ingreso', EGRESO: 'Registrar egreso' } as const;

/**
 * Pantalla `/conductor/acceso/:codigo` · rol CONDUCTOR
 *
 * Adonde lleva el QR de la entrada. Muestra que se va a registrar (ingreso o
 * egreso, segun la reserva) y espera la confirmacion: un escaneo accidental
 * no registra nada.
 */
@Component({
  selector: 'app-acceso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink, DatePipe],
  templateUrl: './acceso.html',
})
export class Acceso {
  private readonly reservas = inject(ReservaService);

  /** Llega del parametro de ruta `:codigo`, tal cual lo escaneo o tipeo el conductor. */
  readonly codigo = input.required<string>();

  protected readonly textoAccion = TEXTO_ACCION;

  protected readonly codigoNormalizado = computed(() => normalizarCodigo(this.codigo()));
  protected readonly codigoVisible = computed(() => {
    const codigo = this.codigoNormalizado();
    return codigo ? formatearCodigo(codigo) : this.codigo();
  });

  protected readonly previa = rxResource({
    params: () => this.codigoNormalizado() ?? undefined,
    stream: ({ params }) => this.reservas.previaAcceso(params),
  });

  protected readonly registrandoId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly resultado = signal<ResultadoAcceso | null>(null);

  protected registrar(candidata: CandidataAcceso): void {
    const codigo = this.codigoNormalizado();
    if (!codigo) return;

    this.registrandoId.set(candidata.reserva.id);
    this.error.set(null);
    this.reservas.registrarAcceso(codigo, candidata.reserva.id).subscribe({
      next: (resultado) => {
        this.registrandoId.set(null);
        this.resultado.set(resultado);
      },
      error: (e: Error) => {
        this.registrandoId.set(null);
        this.error.set(e.message);
      },
    });
  }
}
```

`Front/src/app/pages/conductor/acceso/acceso.html`:

```html
<div class="aparece mx-auto w-full max-w-[560px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
  <div class="flex flex-col gap-6">
    <header>
      <p class="eyebrow">Código {{ codigoVisible() }}</p>
      <h1 class="titulo-vista mt-1.5">
        {{ previa.value()?.estacionamiento?.nombre ?? 'Registrar acceso' }}
      </h1>
    </header>

    @if (!codigoNormalizado()) {
      <ui-estado-vacio
        titulo="Ese código no es válido"
        descripcion="Tiene 6 caracteres, como K7M-2QX. Revisalo en el cartel de la entrada."
      >
        <ui-boton routerLink="/conductor/mis-reservas">Ir a mis reservas</ui-boton>
      </ui-estado-vacio>
    } @else if (resultado(); as hecho) {
      <ui-tarjeta>
        <div class="flex flex-col items-center gap-2 py-4 text-center" role="status">
          <p class="text-[18px] font-semibold text-tinta">
            {{ hecho.accion === 'INGRESO' ? 'Ingreso registrado' : 'Egreso registrado' }}
          </p>
          <p class="text-[14px] text-plomo">
            Cochera {{ hecho.reserva.cocheraIdentificador }} · {{ hecho.reserva.vehiculo.patente }} ·
            {{ (hecho.accion === 'INGRESO' ? hecho.reserva.ingresoEn : hecho.reserva.egresoEn) | date: 'HH:mm' }}
          </p>
          <ui-boton variante="primario" class="mt-3" routerLink="/conductor/mis-reservas">
            Ver mis reservas
          </ui-boton>
        </div>
      </ui-tarjeta>
    } @else if (previa.isLoading()) {
      <ui-cargando [cantidad]="1" />
    } @else if (previa.error(); as e) {
      <ui-estado-vacio titulo="No se puede registrar" [descripcion]="e.message">
        <ui-boton routerLink="/conductor/mis-reservas">Ir a mis reservas</ui-boton>
      </ui-estado-vacio>
    } @else if (previa.value(); as datos) {
      @if (datos.candidatas.length > 1) {
        <p class="text-[13px] text-plomo">Tenés más de una reserva acá. Elegí cuál registrar.</p>
      }
      @for (candidata of datos.candidatas; track candidata.reserva.id) {
        <ui-tarjeta>
          <div class="flex flex-col gap-3">
            <div>
              <p class="text-[15px] font-semibold text-tinta">
                Cochera {{ candidata.reserva.cocheraIdentificador }}
                @if (candidata.reserva.cochera?.sector; as sector) {
                  <span class="font-normal text-plomo"> · {{ sector }}</span>
                }
              </p>
              <p class="mt-1 text-[13px] text-plomo">
                {{ candidata.reserva.horaDesde }}–{{ candidata.reserva.horaHasta }} ·
                {{ candidata.reserva.vehiculo.patente }}
              </p>
            </div>
            <ui-boton
              variante="primario"
              [bloque]="true"
              [cargando]="registrandoId() === candidata.reserva.id"
              (presionado)="registrar(candidata)"
            >
              {{ textoAccion[candidata.accion] }}
            </ui-boton>
          </div>
        </ui-tarjeta>
      }
      @if (error(); as mensaje) {
        <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
      }
    }
  </div>
</div>
```

- [ ] **Step 3: "Tengo un código" en Mis reservas**

En `mis-reservas.ts`:
- Sumar `Router` al import de `@angular/router`.
- Sumar `normalizarCodigo` desde `@app/utils/codigo-acceso.util`.
- Agregar en la clase:

```ts
  private readonly router = inject(Router);

  /** Campo "Tengo un codigo": por si la camara no lee el QR de la entrada. */
  protected readonly ingresandoCodigo = signal(false);
  protected readonly errorCodigo = signal<string | null>(null);

  protected irAlCodigo(bruto: string): void {
    const codigo = normalizarCodigo(bruto);
    if (!codigo) {
      this.errorCodigo.set('El código tiene 6 caracteres, como K7M-2QX');
      return;
    }
    this.errorCodigo.set(null);
    void this.router.navigate(['/conductor/acceso', codigo]);
  }
```

En `mis-reservas.html`, dentro del `<header>`, justo después de `<h1 class="titulo-vista mt-1.5">Mis reservas</h1>`:

```html
      <div class="mt-3">
        @if (!ingresandoCodigo()) {
          <ui-boton tamano="sm" (presionado)="ingresandoCodigo.set(true)">Tengo un código</ui-boton>
        } @else {
          <form class="flex flex-wrap items-start gap-2" (submit)="$event.preventDefault(); irAlCodigo(campo.value)">
            <label class="sr-only" for="codigo-acceso">Código del estacionamiento</label>
            <input
              #campo
              id="codigo-acceso"
              class="h-10 w-36 rounded-boton border border-borde bg-papel px-3 text-[15px] uppercase tracking-[0.12em]"
              placeholder="K7M-2QX"
              autocomplete="off"
              autocapitalize="characters"
              maxlength="8"
            />
            <ui-boton tipo="submit" variante="primario" tamano="sm">Registrar</ui-boton>
            <ui-boton tamano="sm" (presionado)="ingresandoCodigo.set(false)">Cancelar</ui-boton>
            @if (errorCodigo(); as mensaje) {
              <p class="w-full text-[12.5px] text-ocupada" role="alert">{{ mensaje }}</p>
            }
          </form>
        }
      </div>
```

Si `ui-boton` no acepta `tamano="sm"`, usá el valor de `TamanoBoton` que exista (ver `components/ui/boton/boton.ts`).

- [ ] **Step 4: Compilar y correr los tests**

Run: `cd Front && npx ng build --configuration development && npx ng test --watch=false`
Expected: build sin errores y tests PASS.

- [ ] **Step 5: Probar a mano el flujo completo**

Con back y front levantados:
1. Un conductor reserva y el propietario confirma.
2. Correr la reserva a "ahora": `UPDATE reserva SET inicio = now() - interval '5 minutes', fin = now() + interval '1 hour' WHERE id_reserva = '<id>';`
3. Abrir `/conductor/acceso/<codigo>` y ver la tarjeta con "Registrar ingreso". Confirmar: "Ingreso registrado" con la cochera, la patente y la hora.
4. Volver a abrir la misma URL: aparece "Registrar egreso". Confirmar antes de que pase un minuto: error "Acabas de registrar el ingreso…". Esperar un minuto y confirmar: "Egreso registrado".
5. Cerrar sesión, abrir `/conductor/acceso/<codigo>`, loguearse y verificar que vuelve a esa pantalla. Si no vuelve, revisar que `pages/ingresar/ingresar.ts` navegue a `queryParams.redirigir` después del login y corregirlo ahí.
6. En "Mis reservas", "Tengo un código" con `k7m 2qx` (cualquier formato) navega a la pantalla. Con `abc` muestra el error de formato.
7. En el panel del propietario, los botones "Registrar ingreso" y "Registrar egreso" siguen funcionando (acción simulada del operador).

- [ ] **Step 6: Commit**

```bash
git add Front/src/app/app.routes.ts Front/src/app/pages/conductor/acceso Front/src/app/pages/conductor/mis-reservas
git commit -m "Pantalla del conductor para registrar ingreso y egreso con el QR o el codigo"
```
