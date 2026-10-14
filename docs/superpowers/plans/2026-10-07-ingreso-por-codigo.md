# Ingreso y egreso con el QR de la reserva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada reserva tiene un código y un QR propios. El conductor los muestra al entrar y al salir, y el operador (el propietario) los escanea o tipea para registrar el ingreso o el egreso.

**Architecture:** La base genera `reserva.codigo_acceso` (8 caracteres) con la función SQL `generar_codigo_acceso()` como `DEFAULT`. Las reglas de ingreso y egreso se extraen de `registrarIngreso` y `registrarEgreso` a `aplicarIngreso` y `aplicarEgreso`, que comparten la entrada por id (los botones actuales, sin cambios) y la nueva por código. El QR codifica la URL `/propietario/acceso/<codigo>`: el operador lo escanea con la cámara del celular y se abre la confirmación en la app, así no hace falta un lector dentro de la app.

**Tech Stack:**
- Back: Node + Express + PostgreSQL (`pg`), pruebas con `node --test` contra la base de `DATABASE_URL`.
- Front: Angular 21 (standalone, signals, `rxResource`/`resource`), Tailwind 4 y Vitest (`ng test`).
- Librería nueva: `qrcode`.

**Spec:** `docs/superpowers/specs/2026-10-07-ingreso-codigo-y-abonos-design.md` (Parte A)

## Global Constraints

- Alfabeto del código: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, largo 8.
- El código se muestra como `XXXX-XXXX`. Al validar se ignoran guiones, espacios y mayúsculas/minúsculas.
- Solo ven el código el conductor de la reserva y el propietario del estacionamiento (`SELECT_DETALLE`, que no usa ningún endpoint público).
- La ventana de ingreso: desde `inicio - MARGEN_INGRESO_MS` (30 min) hasta `fin`.
- Los endpoints `PATCH /reservas/:id/ingreso|egreso` no cambian su contrato.
- Mensajes al usuario en español rioplatense; en el back, sin tildes (como el resto de los mensajes de `ApiError`).
- Commits sin trailer `Co-Authored-By`. Rama: `feat/ingreso-codigo-y-abonos`.
- **Hay cambios sin commitear de otra persona** en `ciclo-reserva.ts`, `ciclo-reserva.spec.ts`, `fila-reserva.ts` y `pages/propietario/reservas/*` (habilitan el botón de ingreso solo dentro de la ventana). Antes de la Task 6, confirmá con el dueño de esos cambios si ya están commiteados. No los pises: la Task 6 solo agrega un botón al encabezado de `reservas.html`.

## Review Focus

1. **Doble escaneo rápido** (el operador escanea dos veces o recarga la pantalla): el segundo POST no tiene que registrar el egreso enseguida. Un egreso por código dentro de los 60 s posteriores al ingreso responde 409. Prueba en la Task 3.
2. **Reserva ACTIVA cuyo `fin` ya pasó** (el auto se quedó de más y el job todavía no la cerró): el código tiene que permitir el egreso. Prueba en la Task 3.
3. **Código de una reserva de otro propietario:** 404 con el mismo mensaje que un código inexistente, sin revelar que la reserva existe. Prueba en la Task 3.
4. **Formato basura** (`"' OR 1=1"`, 50 caracteres, ausente): 400 o 404, nunca 500. Prueba en la Task 3.
5. **Abrir el link sin sesión:** después del login tiene que volver a `/propietario/acceso/<codigo>`. `authGuard` ya agrega `?redirigir=`; la Task 6 verifica a mano que `ingresar.ts` lo respete.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `Back/src/db/schema.sql` | Función `generar_codigo_acceso(largo)`, columna, relleno e índice único |
| `Back/src/utils/codigoAcceso.js` (nuevo) | `normalizarCodigo`: reglas puras del formato |
| `Back/src/services/reserva.service.js` | `codigo_acceso` en el detalle, `aplicarIngreso`/`aplicarEgreso`, `previaAcceso`, `registrarAcceso` |
| `Back/src/controllers/reserva.controller.js`, `Back/src/routes/reserva.routes.js`, `Back/src/validators/reserva.validator.js` | Endpoints y validación |
| `Back/pruebas/codigo-acceso.test.mjs` (nuevo) | Pruebas puras de `normalizarCodigo` |
| `Back/pruebas/acceso.test.mjs` (nuevo) | Integración de todo el flujo |
| `Front/src/app/utils/codigo-acceso.util.ts` (+ spec) | `normalizarCodigo`, `formatearCodigo`, `urlDeAcceso` |
| `Front/src/app/models/reserva.model.ts`, `services/api/*`, `services/reserva.service.ts` | Tipos, mapeo y llamadas HTTP |
| `Front/src/app/components/reserva/qr-reserva/` (nuevo) | QR + código de una reserva |
| `Front/src/app/components/reserva/tarjeta-reserva/*`, `pages/conductor/mis-reservas/*` | Botón "Ver QR" y modal |
| `Front/src/app/pages/propietario/acceso/` (nuevo) | Pantalla de confirmación del operador |
| `Front/src/app/components/reserva/ingresar-codigo/` (nuevo) | Campo "Ingresar código" para el tablero y "Reservas recibidas" |

---

### Task 1: Código de acceso en la base

**Files:**
- Modify: `Back/src/db/schema.sql` (al final)
- Create: `Back/src/utils/codigoAcceso.js`
- Test: `Back/pruebas/codigo-acceso.test.mjs`

**Interfaces:**
- Produces:
  - Función SQL `generar_codigo_acceso(largo INT) RETURNS TEXT`.
  - Columna `reserva.codigo_acceso VARCHAR(8) NOT NULL UNIQUE` con `DEFAULT generar_codigo_acceso(8)`.
  - `normalizarCodigo(bruto: unknown): string | null`, `ALFABETO_CODIGO` y `LARGO_CODIGO = 8`.

- [ ] **Step 1: Escribir la prueba que falla**

`Back/pruebas/codigo-acceso.test.mjs`:

```js
// Codigo de acceso de la reserva: reglas puras de formato. No usa la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizarCodigo } from '../src/utils/codigoAcceso.js';

describe('normalizarCodigo', () => {
  test('acepta el codigo tal cual', () => {
    assert.equal(normalizarCodigo('K7MQ2XTR'), 'K7MQ2XTR');
  });

  test('ignora guion, espacios y minusculas', () => {
    assert.equal(normalizarCodigo(' k7mq-2xtr '), 'K7MQ2XTR');
    assert.equal(normalizarCodigo('k7mq 2xtr'), 'K7MQ2XTR');
  });

  test('rechaza caracteres ambiguos que no estan en el alfabeto', () => {
    for (const ambiguo of ['0', 'O', '1', 'I', 'L']) {
      assert.equal(normalizarCodigo(`K7MQ2XT${ambiguo}`), null, ambiguo);
    }
  });

  test('rechaza largos distintos de 8 y valores que no son texto', () => {
    assert.equal(normalizarCodigo('K7MQ2XT'), null);
    assert.equal(normalizarCodigo('K7MQ2XTRR'), null);
    assert.equal(normalizarCodigo("' OR 1=1"), null);
    assert.equal(normalizarCodigo(null), null);
    assert.equal(normalizarCodigo(12345678), null);
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd Back && node --test pruebas/codigo-acceso.test.mjs`
Expected: FAIL con `Cannot find module '../src/utils/codigoAcceso.js'`

- [ ] **Step 3: Implementar el util**

`Back/src/utils/codigoAcceso.js`:

```js
// Codigo de acceso de la reserva: el que va en su QR y que el operador
// escanea (o tipea) al entrar y al salir. Lo genera la base
// (generar_codigo_acceso() en schema.sql); aca solo se valida lo que llega.

/** Sin 0 O 1 I L, que se confunden al leerlos o dictarlos. Tiene que coincidir con schema.sql. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 8;

const REGEX_CODIGO = new RegExp(`^[${ALFABETO_CODIGO}]{${LARGO_CODIGO}}$`);

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
-- Codigo de acceso de la reserva: va en su QR. El conductor lo muestra al
-- entrar y al salir y el operador lo escanea (o lo tipea). Es unico por
-- reserva. Sin 0 O 1 I L para que no se confundan; el alfabeto tiene que
-- coincidir con src/utils/codigoAcceso.js. Lo genera la base, asi el INSERT
-- de reserva.service.js no cambia.
CREATE OR REPLACE FUNCTION generar_codigo_acceso(largo INT) RETURNS TEXT AS $$
DECLARE
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codigo TEXT := '';
BEGIN
  FOR i IN 1..largo LOOP
    codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN codigo;
END
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE reserva
  ADD COLUMN IF NOT EXISTS codigo_acceso VARCHAR(8);

-- Relleno de las reservas que ya existen. Con 31^8 combinaciones una colision
-- es practicamente imposible; si pasara, el CREATE UNIQUE INDEX de abajo falla
-- y alcanza con volver a migrar.
UPDATE reserva SET codigo_acceso = generar_codigo_acceso(8) WHERE codigo_acceso IS NULL;

ALTER TABLE reserva
  ALTER COLUMN codigo_acceso SET DEFAULT generar_codigo_acceso(8),
  ALTER COLUMN codigo_acceso SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reserva_codigo_acceso_unico ON reserva (codigo_acceso);
```

- [ ] **Step 6: Aplicar la migración dos veces (es idempotente) y verificar**

Run: `cd Back && npm run db:migrate && npm run db:migrate`
Expected: dos veces `[migrate] listo`, sin errores.

Run: `cd Back && node --env-file=.env -e "import('./src/config/database.js').then(async ({query,pool})=>{const r=await query('SELECT count(*) FILTER (WHERE codigo_acceso IS NULL) AS nulos, count(DISTINCT codigo_acceso) = count(*) AS unicos FROM reserva');console.log(r.rows[0]);await pool.end()})"`
Expected: `{ nulos: '0', unicos: true }`

- [ ] **Step 7: Correr toda la suite (nada debería romperse)**

Run: `cd Back && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add Back/src/db/schema.sql Back/src/utils/codigoAcceso.js Back/pruebas/codigo-acceso.test.mjs
git commit -m "Codigo de acceso unico por reserva generado en la base"
```

---

### Task 2: El código en el detalle y reglas de ingreso y egreso reutilizables

**Files:**
- Modify: `Back/src/services/reserva.service.js` (`SELECT_DETALLE` y líneas 469-505)
- Test: `Back/pruebas/acceso.test.mjs` (nuevo)

**Interfaces:**
- Consumes: la columna `reserva.codigo_acceso` (Task 1).
- Produces:
  - `codigo_acceso` en toda respuesta que use `SELECT_DETALLE` (`GET /reservas`, `GET /estacionamientos/:id/reservas`, `POST /reservas`, transiciones).
  - Funciones internas `aplicarIngreso(client, reserva): Promise<void>` y `aplicarEgreso(client, reserva): Promise<void>`, donde `reserva` es una fila bloqueada con al menos `id_reserva, estado, inicio, fin, ingreso_real, egreso_real, id_cochera`.
  - Constante `MARGEN_EGRESO_TRAS_INGRESO_MS = 60_000`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`Back/pruebas/acceso.test.mjs`:

```js
// Ingreso y egreso con el codigo (QR) de la reserva.
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

const FORMATO_CODIGO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/** Reserva de manana (08:00 a 10:00), confirmada por el propietario. */
async function escenario({ cocheras = 1 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const reserva = await reservaConfirmada(propietario, conductor, estacionamiento, vehiculo);
  return { propietario, estacionamiento, conductor, vehiculo, reserva };
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
  const confirmada = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, {
    token: propietario.token,
  });
  return confirmada.datos.reserva;
}

describe('codigo de la reserva', () => {
  test('cada reserva nace con su codigo, distinto del de las demas', async () => {
    const { propietario, estacionamiento, conductor, reserva } = await escenario({ cocheras: 2 });
    const otroVehiculo = await crearVehiculo(conductor.token);
    const otra = await reservaConfirmada(propietario, conductor, estacionamiento, otroVehiculo);

    assert.match(reserva.codigo_acceso, FORMATO_CODIGO);
    assert.match(otra.codigo_acceso, FORMATO_CODIGO);
    assert.notEqual(reserva.codigo_acceso, otra.codigo_acceso);
  });

  test('lo ven el conductor en sus reservas y el propietario en las recibidas', async () => {
    const { propietario, estacionamiento, conductor, reserva } = await escenario();

    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);

    const recibidas = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reservas`,
      { token: propietario.token },
    );
    assert.equal(recibidas.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);
  });
});
```

(`motivo`, `ponerEnCurso` y `query` se usan en la Task 3. Si el linter se queja de imports sin usar, agregalos recién en la Task 3.)

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: FAIL. `codigo_acceso` llega `undefined` y no coincide con el formato.

- [ ] **Step 3: Sumar el código al detalle**

En `Back/src/services/reserva.service.js`, dentro de `SELECT_DETALLE`, cambiar la línea

```js
         r.modalidad, r.precio_total, r.motivo_reasignacion,
```

por

```js
         r.modalidad, r.precio_total, r.motivo_reasignacion, r.codigo_acceso,
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Separar las reglas de ingreso y egreso (refactor sin cambio de comportamiento)**

Reemplazar desde `/** Llego el vehiculo:` hasta el cierre de `registrarEgreso` por:

```js
/**
 * Un egreso pegado al ingreso es casi seguro un doble escaneo del QR (o una
 * recarga de la pantalla), no un auto que entro y salio: se rechaza. Solo
 * aplica a la entrada por codigo; los botones del propietario no lo usan.
 */
const MARGEN_EGRESO_TRAS_INGRESO_MS = 60 * 1000;

/**
 * Reglas del ingreso sobre una reserva ya bloqueada. Las comparten el boton
 * del propietario (registrarIngreso) y el QR de la reserva (registrarAcceso).
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

- [ ] **Step 6: Correr toda la suite (el refactor no cambia nada)**

Run: `cd Back && npm test`
Expected: PASS, incluidas las pruebas de "ciclo de la reserva" de `reserva.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add Back/src/services/reserva.service.js Back/pruebas/acceso.test.mjs
git commit -m "Codigo de acceso en el detalle de la reserva y reglas de ingreso/egreso reutilizables"
```

---

### Task 3: El operador registra ingreso y egreso con el código

**Files:**
- Modify: `Back/src/services/reserva.service.js` (debajo de `registrarEgreso`)
- Modify: `Back/src/validators/reserva.validator.js`
- Modify: `Back/src/controllers/reserva.controller.js`
- Modify: `Back/src/routes/reserva.routes.js`
- Test: `Back/pruebas/acceso.test.mjs`

**Interfaces:**
- Consumes: `aplicarIngreso`, `aplicarEgreso`, `MARGEN_EGRESO_TRAS_INGRESO_MS` (Task 2), `normalizarCodigo` (Task 1), `obtenerDetalle` (existente).
- Produces:
  - `GET /api/reservas/acceso/:codigo` (PROPIETARIO) → `200 { accion: 'INGRESO'|'EGRESO', reserva: <ReservaDto> }`, sin efectos.
  - `POST /api/reservas/acceso` (PROPIETARIO), body `{ codigo: string }` → `200 { accion, reserva }`.
  - Errores: 404 si el código es inexistente, está mal formado o es de un estacionamiento ajeno (mismo mensaje); 409 si la reserva está pendiente, cancelada o finalizada, si es demasiado temprano, si la franja terminó sin ingreso o si el egreso llega justo después del ingreso; 400 si falta `codigo`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `Back/pruebas/acceso.test.mjs`:

```js
const acceder = (propietario, codigo) =>
  api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } });

const estadoCochera = async (idCochera) =>
  (await query('SELECT estado_actual FROM cochera WHERE id_cochera = $1', [idCochera])).rows[0]
    .estado_actual;

/** Corre el ingreso_real hacia atras para pasar el margen anti doble escaneo. */
const ingresoHaceUnRato = (idReserva) =>
  query(`UPDATE reserva SET ingreso_real = now() - interval '10 minutes' WHERE id_reserva = $1`, [
    idReserva,
  ]);

describe('ingreso y egreso con el codigo de la reserva', () => {
  test('ingreso en la ventana: ACTIVA y cochera OCUPADA', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'INGRESO');
    assert.equal(datos.reserva.estado, 'ACTIVA');
    assert.ok(datos.reserva.ingreso_real);
    assert.equal(await estadoCochera(reserva.id_cochera), 'OCUPADA');
  });

  test('egreso con el mismo codigo: FINALIZADA y cochera LIBRE', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);
    await ingresoHaceUnRato(reserva.id_reserva);

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
    assert.equal(datos.reserva.estado, 'FINALIZADA');
    assert.equal(await estadoCochera(reserva.id_cochera), 'LIBRE');
  });

  test('doble escaneo: el segundo no registra el egreso enseguida', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);

    const segundo = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(segundo.estado, 409);
    assert.match(motivo(segundo), /acabas de registrar el ingreso/i);
  });

  test('egreso aunque la franja ya haya terminado', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);
    await query(
      `UPDATE reserva SET inicio = now() - interval '3 hours', fin = now() - interval '10 minutes',
              ingreso_real = now() - interval '3 hours'
        WHERE id_reserva = $1`,
      [reserva.id_reserva],
    );

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
  });

  test('el codigo se acepta en minusculas y con guion', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const c = reserva.codigo_acceso;

    const { estado } = await acceder(propietario, `${c.slice(0, 4)}-${c.slice(4)}`.toLowerCase());

    assert.equal(estado, 200);
  });

  test('vista previa: dice que se va a registrar sin registrar nada', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await api('GET', `/reservas/acceso/${reserva.codigo_acceso}`, {
      token: propietario.token,
    });

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'INGRESO');
    assert.equal(datos.reserva.id_reserva, reserva.id_reserva);
    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [reserva.id_reserva]);
    assert.equal(rows[0].estado, 'CONFIRMADA');
  });

  test('codigo inexistente, mal formado o basura: 400 o 404, nunca 500', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });

    for (const codigo of ['ZZZZZZZZ', 'K7MQ2XT0', "' OR 1=1", 'x'.repeat(50)]) {
      const respuesta = await acceder(propietario, codigo);
      assert.ok([400, 404].includes(respuesta.estado), `${codigo}: ${respuesta.estado}`);
    }
    const sinCodigo = await api('POST', '/reservas/acceso', { token: propietario.token, body: {} });
    assert.equal(sinCodigo.estado, 400);
  });

  test('codigo de una reserva de otro propietario: 404 con el mismo mensaje', async () => {
    const { reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });

    const ajena = await acceder(otro, reserva.codigo_acceso);
    const inexistente = await acceder(otro, 'ZZZZZZZZ');

    assert.equal(ajena.estado, 404);
    assert.equal(motivo(ajena), motivo(inexistente));
  });

  test('reserva pendiente: todavia no esta confirmada', async () => {
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

    const respuesta = await acceder(propietario, datos.reserva.codigo_acceso);

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /todavia no esta confirmada/i);
  });

  test('reserva cancelada o finalizada: 409', async () => {
    const { propietario, conductor, reserva } = await escenario();
    await api('PATCH', `/reservas/${reserva.id_reserva}/cancelar`, { token: conductor.token });

    const cancelada = await acceder(propietario, reserva.codigo_acceso);
    assert.equal(cancelada.estado, 409);
    assert.match(motivo(cancelada), /cancelada/i);

    const otra = await escenario();
    await ponerEnCurso(otra.reserva.id_reserva);
    await acceder(otra.propietario, otra.reserva.codigo_acceso);
    await ingresoHaceUnRato(otra.reserva.id_reserva);
    await acceder(otra.propietario, otra.reserva.codigo_acceso);

    const finalizada = await acceder(otra.propietario, otra.reserva.codigo_acceso);
    assert.equal(finalizada.estado, 409);
    assert.match(motivo(finalizada), /ya termino/i);
  });

  test('demasiado temprano: dice desde que hora se puede ingresar', async () => {
    const { propietario, reserva } = await escenario(); // manana de 08:00 a 10:00

    const respuesta = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /empieza a las 08:00; se puede ingresar desde las 07:30/i);
  });

  test('un conductor no puede usar los endpoints de acceso', async () => {
    const { conductor, reserva } = await escenario();

    assert.equal((await acceder(conductor, reserva.codigo_acceso)).estado, 403);
    const previa = await api('GET', `/reservas/acceso/${reserva.codigo_acceso}`, { token: conductor.token });
    assert.equal(previa.estado, 403);
  });
});
```

Nota sobre "demasiado temprano": `franja()` arma la franja de mañana a las 08:00 en hora argentina, así que el mensaje tiene que formatear la hora en `America/Argentina/Buenos_Aires`, no en la zona del servidor.

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/acceso.test.mjs`
Expected: los 2 tests de la Task 2 pasan y los nuevos fallan con 404 (la ruta no existe).

- [ ] **Step 3: Servicio**

En `Back/src/services/reserva.service.js`, agregar el import:

```js
import { normalizarCodigo } from '../utils/codigoAcceso.js';
```

Y debajo de `registrarEgreso`:

```js
/* ----------------------- ingreso y egreso por codigo -----------------------
   El conductor muestra el QR de su reserva al entrar y al salir; el operador
   (hoy, el propietario) lo escanea o tipea el codigo. El mismo codigo sirve
   para las dos cosas: el estado de la reserva decide que se registra.
-------------------------------------------------------------------------- */

const ACCIONES_ACCESO = Object.freeze({ INGRESO: 'INGRESO', EGRESO: 'EGRESO' });

const HORA_LOCAL = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Mismo mensaje para un codigo inexistente, mal formado o de un estacionamiento ajeno. */
const CODIGO_INVALIDO = 'El codigo no corresponde a ninguna reserva de tus estacionamientos';

async function buscarReservaPorCodigo(ejecutor, idPropietario, bruto, { bloquear = false } = {}) {
  const codigo = normalizarCodigo(bruto);
  if (!codigo) throw ApiError.notFound(CODIGO_INVALIDO);

  const { rows } = await ejecutor.query(
    `SELECT r.id_reserva, r.estado, r.inicio, r.fin, r.ingreso_real, r.egreso_real, r.id_cochera
       FROM reserva r
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.codigo_acceso = $1 AND e.id_propietario = $2
      ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [codigo, idPropietario],
  );
  if (!rows[0]) throw ApiError.notFound(CODIGO_INVALIDO);
  return rows[0];
}

/**
 * Que se registra ahora sobre esta reserva. Una ACTIVA da egreso aunque su
 * `fin` haya pasado (el auto sigue adentro); el resto explica por que no.
 */
function accionPara(reserva, ahora = Date.now()) {
  switch (reserva.estado) {
    case ESTADOS_RESERVA.ACTIVA:
      return ACCIONES_ACCESO.EGRESO;
    case ESTADOS_RESERVA.CONFIRMADA: {
      const desde = new Date(reserva.inicio.getTime() - MARGEN_INGRESO_MS);
      if (ahora < desde.getTime()) {
        throw ApiError.conflict(
          `La reserva empieza a las ${HORA_LOCAL.format(reserva.inicio)}; ` +
            `se puede ingresar desde las ${HORA_LOCAL.format(desde)}`,
        );
      }
      if (ahora > reserva.fin.getTime()) throw ApiError.conflict('La franja de la reserva ya termino');
      return ACCIONES_ACCESO.INGRESO;
    }
    case ESTADOS_RESERVA.PENDIENTE:
      throw ApiError.conflict('La reserva todavia no esta confirmada');
    case ESTADOS_RESERVA.CANCELADA:
      throw ApiError.conflict('La reserva esta cancelada');
    default:
      throw ApiError.conflict('La reserva ya termino');
  }
}

/** Vista previa para la pantalla de confirmacion del operador: no registra nada. */
export async function previaAcceso(idPropietario, codigo) {
  const reserva = await buscarReservaPorCodigo({ query }, idPropietario, codigo);
  const accion = accionPara(reserva);
  return { accion, reserva: await obtenerDetalle({ query }, reserva.id_reserva) };
}

/**
 * Registra el ingreso o el egreso. Vuelve a resolver la accion con la reserva
 * bloqueada: entre la vista previa y la confirmacion puede haber cambiado.
 */
export async function registrarAcceso(idPropietario, { codigo }) {
  return withTransaction(async (client) => {
    const reserva = await buscarReservaPorCodigo(client, idPropietario, codigo, { bloquear: true });
    const accion = accionPara(reserva);

    if (accion === ACCIONES_ACCESO.INGRESO) {
      await aplicarIngreso(client, reserva);
    } else {
      if (Date.now() - reserva.ingreso_real.getTime() < MARGEN_EGRESO_TRAS_INGRESO_MS) {
        throw ApiError.conflict('Acabas de registrar el ingreso; el egreso se marca cuando el auto se va');
      }
      await aplicarEgreso(client, reserva);
    }

    return { accion, reserva: await obtenerDetalle(client, reserva.id_reserva) };
  });
}
```

`{ query }` funciona como "ejecutor" porque `obtenerDetalle` y `buscarReservaPorCodigo` solo llaman a `.query(...)`, igual que con el `client` de una transacción (ver el comentario de `obtenerDetalle`).

- [ ] **Step 4: Validador**

Al final de `Back/src/validators/reserva.validator.js`:

```js
/** `POST /reservas/acceso`: el formato fino del codigo lo valida el servicio (404 si no existe). */
export function validarAcceso(body) {
  return campos(body).texto('codigo', body.codigo, { max: 20 }).resultado();
}
```

- [ ] **Step 5: Controlador y rutas**

Al final de `Back/src/controllers/reserva.controller.js`:

```js
export const previaAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.previaAcceso(req.usuario.id, req.params.codigo));
});

export const registrarAcceso = asyncHandler(async (req, res) => {
  res.json(await reservaService.registrarAcceso(req.usuario.id, req.body));
});
```

En `Back/src/routes/reserva.routes.js`, cambiar el import del validador a `import { validarAcceso, validarReserva } from '../validators/reserva.validator.js';` y agregar al final, antes de `export default router;`:

```js
// El operador escanea (o tipea) el QR de la reserva al entrar y al salir.
router.get('/acceso/:codigo', ...soloPropietario, reservaController.previaAcceso);
router.post('/acceso', ...soloPropietario, validate(validarAcceso), reservaController.registrarAcceso);
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
git commit -m "El operador registra ingreso y egreso con el codigo de la reserva"
```

---

### Task 4: Front — util del código, modelos y servicio

**Files:**
- Create: `Front/src/app/utils/codigo-acceso.util.ts`
- Test: `Front/src/app/utils/codigo-acceso.util.spec.ts`
- Modify: `Front/src/app/models/reserva.model.ts`
- Modify: `Front/src/app/services/api/api.dto.ts`
- Modify: `Front/src/app/services/api/api.mapeo.ts`
- Modify: `Front/src/app/services/reserva.service.ts`

**Interfaces:**
- Consumes: los endpoints de las Tasks 2 y 3.
- Produces:
  - `normalizarCodigo(bruto: string): string | null`, `formatearCodigo(codigo: string): string` y `urlDeAcceso(codigo: string, origen?: string): string`.
  - `Reserva.codigoAcceso: string`.
  - Tipos `AccionAcceso` y `AccesoReserva { accion, reserva: ReservaDetallada }`.
  - `ReservaService.previaAcceso(codigo): Observable<AccesoReserva>` y `ReservaService.registrarAcceso(codigo): Observable<AccesoReserva>`.

- [ ] **Step 1: Escribir la prueba que falla**

`Front/src/app/utils/codigo-acceso.util.spec.ts`:

```ts
import { formatearCodigo, normalizarCodigo, urlDeAcceso } from './codigo-acceso.util';

describe('normalizarCodigo', () => {
  it('ignora guion, espacios y minusculas', () => {
    expect(normalizarCodigo(' k7mq-2xtr ')).toBe('K7MQ2XTR');
  });

  it('rechaza caracteres ambiguos y largos incorrectos', () => {
    expect(normalizarCodigo('K7MQ2XT0')).toBeNull();
    expect(normalizarCodigo('K7MQ2XT')).toBeNull();
    expect(normalizarCodigo('')).toBeNull();
  });
});

describe('formatearCodigo', () => {
  it('lo parte en dos para leerlo o dictarlo', () => {
    expect(formatearCodigo('K7MQ2XTR')).toBe('K7MQ-2XTR');
  });
});

describe('urlDeAcceso', () => {
  it('apunta a la pantalla del operador', () => {
    expect(urlDeAcceso('K7MQ2XTR', 'https://parkit.app')).toBe(
      'https://parkit.app/propietario/acceso/K7MQ2XTR',
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
 * Codigo de acceso de una reserva (el de su QR). Mismo alfabeto y largo que
 * el backend: sin 0 O 1 I L.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 8;
const REGEX_CODIGO = new RegExp(`^[${ALFABETO}]{${LARGO}}$`);

/** Saca guiones y espacios y pasa a mayusculas. `null` si no tiene forma de codigo. */
export function normalizarCodigo(bruto: string): string | null {
  const limpio = bruto.replace(/[\s-]/g, '').toUpperCase();
  return REGEX_CODIGO.test(limpio) ? limpio : null;
}

/** `K7MQ2XTR` -> `K7MQ-2XTR`. */
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/** URL que codifica el QR: la camara del operador abre la app directo en la confirmacion. */
export function urlDeAcceso(codigo: string, origen: string = globalThis.location.origin): string {
  return `${origen}/propietario/acceso/${codigo}`;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd Front && npx ng test --watch=false --include src/app/utils/codigo-acceso.util.spec.ts`
Expected: PASS

- [ ] **Step 5: Modelos, DTO y mapeo**

En `Front/src/app/models/reserva.model.ts`, dentro de `interface Reserva`, después de `motivoReasignacion`:

```ts
  /** Codigo del QR de la reserva: lo muestra el conductor y lo escanea el operador. */
  codigoAcceso: string;
```

Y al final del archivo:

```ts
/** Lo que registra el QR de la reserva segun su estado. */
export type AccionAcceso = 'INGRESO' | 'EGRESO';

/** Vista previa (`GET /reservas/acceso/:codigo`) y resultado (`POST /reservas/acceso`). */
export interface AccesoReserva {
  accion: AccionAcceso;
  reserva: ReservaDetallada;
}
```

En `Front/src/app/services/api/api.dto.ts`, dentro de `ReservaDto`, después de `motivo_reasignacion`:

```ts
  codigo_acceso: string;
```

Y después de `ReservaDto`:

```ts
export interface AccesoReservaDto {
  accion: 'INGRESO' | 'EGRESO';
  reserva: ReservaDto;
}
```

En `Front/src/app/services/api/api.mapeo.ts`, dentro de `aReserva`, después de `motivoReasignacion: dto.motivo_reasignacion,`:

```ts
    codigoAcceso: dto.codigo_acceso,
```

Y después de `aReserva` (sumar `AccesoReserva` al import de `@app/models` y `AccesoReservaDto` al de `./api.dto`):

```ts
export function aAccesoReserva(dto: AccesoReservaDto): AccesoReserva {
  return { accion: dto.accion, reserva: aReserva(dto.reserva) };
}
```

- [ ] **Step 6: Servicio**

En `Front/src/app/services/reserva.service.ts`:
- Sumar `AccesoReserva` al import de `@app/models`.
- Sumar `AccesoReservaDto` al de `./api/api.dto`.
- Sumar `aAccesoReserva` al de `./api/api.mapeo`.

Después agregar, debajo de `registrarEgreso`:

```ts
  /** `GET /api/reservas/acceso/:codigo`: que registraria el QR, sin registrar nada. */
  previaAcceso(codigo: string): Observable<AccesoReserva> {
    return this.http.get<AccesoReservaDto>(`${this.ruta}/acceso/${codigo}`).pipe(map(aAccesoReserva));
  }

  /** `POST /api/reservas/acceso`: registra el ingreso o el egreso de esa reserva. */
  registrarAcceso(codigo: string): Observable<AccesoReserva> {
    return this.http
      .post<AccesoReservaDto>(`${this.ruta}/acceso`, { codigo })
      .pipe(map(aAccesoReserva));
  }
```

- [ ] **Step 7: Compilar y correr los tests del front**

Run: `cd Front && npx ng build --configuration development && npx ng test --watch=false`
Expected: build sin errores y tests PASS.

- [ ] **Step 8: Commit**

```bash
git add Front/src/app/utils/codigo-acceso.util.ts Front/src/app/utils/codigo-acceso.util.spec.ts Front/src/app/models/reserva.model.ts Front/src/app/services/api Front/src/app/services/reserva.service.ts
git commit -m "Front: codigo de acceso de la reserva y servicio de acceso"
```

---

### Task 5: Front — el conductor ve el QR de su reserva

**Files:**
- Create: `Front/src/app/components/reserva/qr-reserva/qr-reserva.ts`
- Modify: `Front/src/app/components/reserva/index.ts`
- Modify: `Front/src/app/components/reserva/tarjeta-reserva/tarjeta-reserva.ts` y `.html`
- Modify: `Front/src/app/pages/conductor/mis-reservas/mis-reservas.ts` y `.html`
- Modify: `Front/package.json` (dependencia `qrcode`)

**Interfaces:**
- Consumes: `Reserva.codigoAcceso`, `formatearCodigo` y `urlDeAcceso` (Task 4).
- Produces: `<app-qr-reserva [codigo]="..." />` y el output `verQr` de `TarjetaReserva`.

- [ ] **Step 1: Instalar la librería**

Run: `cd Front && npm install qrcode && npm install -D @types/qrcode`
Expected: `package.json` y `package-lock.json` actualizados.

- [ ] **Step 2: Componente del QR**

`Front/src/app/components/reserva/qr-reserva/qr-reserva.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, resource } from '@angular/core';
import QRCode from 'qrcode';
import { formatearCodigo, urlDeAcceso } from '@app/utils/codigo-acceso.util';

/**
 * QR de una reserva con su codigo debajo. El conductor lo muestra al entrar y
 * al salir; si la camara no lo lee, el operador tipea el codigo.
 */
@Component({
  selector: 'app-qr-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-3 text-center">
      @if (imagen.value(); as src) {
        <img [src]="src" alt="QR de la reserva" class="size-56 rounded-boton bg-white p-2" />
      } @else {
        <div class="size-56 animate-pulse rounded-boton bg-borde-sutil" aria-hidden="true"></div>
      }
      <p class="num-tabular text-[22px] font-semibold tracking-[0.12em] text-tinta">
        {{ codigoVisible() }}
      </p>
      <p class="text-[13px] text-plomo">Mostralo al entrar y al salir del estacionamiento.</p>
    </div>
  `,
})
export class QrReserva {
  readonly codigo = input.required<string>();

  protected readonly codigoVisible = computed(() => formatearCodigo(this.codigo()));

  protected readonly imagen = resource({
    params: () => this.codigo(),
    loader: ({ params }) => QRCode.toDataURL(urlDeAcceso(params), { width: 512, margin: 1 }),
  });
}
```

En `Front/src/app/components/reserva/index.ts`, agregar:

```ts
export * from './qr-reserva/qr-reserva';
```

- [ ] **Step 3: Botón "Ver QR" en la tarjeta**

En `tarjeta-reserva.ts`, debajo de `readonly cancelar = output<ReservaDetallada>();`:

```ts
  readonly verQr = output<ReservaDetallada>();

  /** El QR sirve mientras la reserva puede entrar o salir: confirmada o en curso. */
  protected readonly conQr = computed(() => {
    const r = this.reserva();
    // Una ACTIVA lo necesita para salir aunque ya haya pasado su fin.
    return r.estado === 'ACTIVA' || (r.estado === 'CONFIRMADA' && reservaEnJuego(r));
  });
```

En `tarjeta-reserva.html`, dentro del `<footer>`, justo antes de `@if (cancelable()) {`:

```html
      @if (conQr()) {
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-boton px-3 text-[13px] font-semibold
                 text-acento transition-colors duration-160 ease-out hover:bg-acento-suave"
          (click)="verQr.emit(r)"
        >
          Ver QR
        </button>
      }
```

Si el footer queda con tres elementos, envolvé los dos botones en un `<div class="flex items-center gap-1">` para que el precio siga a la izquierda.

- [ ] **Step 4: Modal en Mis reservas**

En `mis-reservas.ts`:
- Sumar `QrReserva` al import de `@app/components/reserva` y al array `imports`.
- Agregar en la clase:

```ts
  /** Reserva cuyo QR se esta mostrando: mientras no sea null, el modal esta abierto. */
  protected readonly conQrAbierto = signal<ReservaDetallada | null>(null);
```

En `mis-reservas.html`, en las dos `<app-tarjeta-reserva` de Vigentes (la de `enCurso()` y la de `proximas()`), agregar el atributo:

```html
          (verQr)="conQrAbierto.set($event)"
```

Y al final del archivo, junto al modal de cancelar:

```html
  <ui-modal titulo="QR de tu reserva" [abierto]="conQrAbierto() !== null" (cerrado)="conQrAbierto.set(null)">
    @if (conQrAbierto(); as r) {
      <div class="flex flex-col gap-4">
        <p class="text-center text-[13px] text-plomo">
          {{ r.estacionamiento.nombre }} · Cochera {{ r.cocheraIdentificador }} ·
          {{ r.horaDesde }}–{{ r.horaHasta }}
        </p>
        <app-qr-reserva [codigo]="r.codigoAcceso" />
      </div>
    }
  </ui-modal>
```

- [ ] **Step 5: Compilar**

Run: `cd Front && npx ng build --configuration development`
Expected: sin errores.

- [ ] **Step 6: Probar a mano**

Con back (`cd Back && npm run dev`) y front (`cd Front && npm start`): como conductor, reservar; como propietario, confirmar. En "Mis reservas" del conductor, "Ver QR" abre el modal con el QR y el código `XXXX-XXXX`. Al escanear el QR con el celular abre `http://<host>/propietario/acceso/<codigo>`. Para probar desde el celular en la red local: `npm start -- --host 0.0.0.0`. Una reserva PENDIENTE o del historial no muestra "Ver QR".

- [ ] **Step 7: Commit**

```bash
git add Front/package.json Front/package-lock.json Front/src/app/components/reserva Front/src/app/pages/conductor/mis-reservas
git commit -m "El conductor ve el QR de su reserva en Mis reservas"
```

---

### Task 6: Front — pantalla del operador e "Ingresar código"

**Files:**
- Create: `Front/src/app/pages/propietario/acceso/acceso.ts`
- Create: `Front/src/app/pages/propietario/acceso/acceso.html`
- Create: `Front/src/app/components/reserva/ingresar-codigo/ingresar-codigo.ts`
- Modify: `Front/src/app/components/reserva/index.ts`
- Modify: `Front/src/app/app.routes.ts` (rama `propietario`, después de `reservas`)
- Modify: `Front/src/app/pages/propietario/tablero/tablero.ts` y `.html`
- Modify: `Front/src/app/pages/propietario/reservas/reservas.ts` y `.html` (ver Global Constraints sobre los cambios sin commitear)

**Interfaces:**
- Consumes: `ReservaService.previaAcceso` y `registrarAcceso`; `normalizarCodigo` y `formatearCodigo` (Task 4).
- Produces: la ruta `/propietario/acceso/:codigo` y el componente `<app-ingresar-codigo />`.

- [ ] **Step 1: Ruta**

En `Front/src/app/app.routes.ts`, dentro de `children` de `propietario`, después del bloque de `reservas`:

```ts
      {
        // Destino del QR de cada reserva: lo escanea el operador al entrar y al salir.
        path: 'acceso/:codigo',
        title: 'Parkit · Registrar acceso',
        loadComponent: () => import('./pages/propietario/acceso/acceso').then((m) => m.Acceso),
      },
```

- [ ] **Step 2: Pantalla de confirmación**

`Front/src/app/pages/propietario/acceso/acceso.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { AccesoReserva } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';
import { formatearCodigo, normalizarCodigo } from '@app/utils/codigo-acceso.util';

const TEXTO_ACCION = { INGRESO: 'Registrar ingreso', EGRESO: 'Registrar egreso' } as const;

/**
 * Pantalla `/propietario/acceso/:codigo` · rol PROPIETARIO (operador)
 *
 * Adonde lleva el QR de una reserva. Muestra que se va a registrar (ingreso o
 * egreso, segun su estado) y espera la confirmacion: un escaneo accidental no
 * registra nada.
 */
@Component({
  selector: 'app-acceso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink, DatePipe],
  templateUrl: './acceso.html',
})
export class Acceso {
  private readonly reservas = inject(ReservaService);

  /** Llega del parametro de ruta `:codigo`, tal cual lo escaneo o tipeo el operador. */
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

  protected readonly registrando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultado = signal<AccesoReserva | null>(null);

  protected registrar(): void {
    const codigo = this.codigoNormalizado();
    if (!codigo) return;

    this.registrando.set(true);
    this.error.set(null);
    this.reservas.registrarAcceso(codigo).subscribe({
      next: (resultado) => {
        this.registrando.set(false);
        this.resultado.set(resultado);
      },
      error: (e: Error) => {
        this.registrando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
```

`Front/src/app/pages/propietario/acceso/acceso.html`:

```html
<div class="aparece mx-auto w-full max-w-[560px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
  <div class="flex flex-col gap-6">
    <header>
      <p class="eyebrow">Código {{ codigoVisible() }}</p>
      <h1 class="titulo-vista mt-1.5">Registrar acceso</h1>
    </header>

    @if (!codigoNormalizado()) {
      <ui-estado-vacio
        titulo="Ese código no es válido"
        descripcion="Tiene 8 caracteres, como K7MQ-2XTR. Revisalo en el QR del conductor."
      >
        <ui-boton routerLink="/propietario/reservas">Ir a reservas</ui-boton>
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
          <ui-boton variante="primario" class="mt-3" routerLink="/propietario/tablero">
            Volver al inicio
          </ui-boton>
        </div>
      </ui-tarjeta>
    } @else if (previa.isLoading()) {
      <ui-cargando [cantidad]="1" />
    } @else if (previa.error(); as e) {
      <ui-estado-vacio titulo="No se puede registrar" [descripcion]="e.message">
        <ui-boton routerLink="/propietario/reservas">Ir a reservas</ui-boton>
      </ui-estado-vacio>
    } @else if (previa.value(); as datos) {
      <ui-tarjeta>
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-[15px] font-semibold text-tinta">
              {{ datos.reserva.estacionamiento.nombre }} · Cochera {{ datos.reserva.cocheraIdentificador }}
            </p>
            <p class="mt-1 text-[13px] text-plomo">
              {{ datos.reserva.horaDesde }}–{{ datos.reserva.horaHasta }} ·
              {{ datos.reserva.vehiculo.patente }}
            </p>
          </div>
          <ui-boton
            variante="primario"
            [bloque]="true"
            [cargando]="registrando()"
            (presionado)="registrar()"
          >
            {{ textoAccion[datos.accion] }}
          </ui-boton>
        </div>
      </ui-tarjeta>
      @if (error(); as mensaje) {
        <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
      }
    }
  </div>
</div>
```

- [ ] **Step 3: Campo "Ingresar código" reutilizable**

`Front/src/app/components/reserva/ingresar-codigo/ingresar-codigo.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Boton } from '@app/components/ui';
import { normalizarCodigo } from '@app/utils/codigo-acceso.util';

/** Para cuando la camara no lee el QR: el operador tipea el codigo de la reserva. */
@Component({
  selector: 'app-ingresar-codigo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton],
  template: `
    @if (!abierto()) {
      <ui-boton tamano="sm" (presionado)="abierto.set(true)">Ingresar código</ui-boton>
    } @else {
      <form class="flex flex-wrap items-start gap-2" (submit)="$event.preventDefault(); ir(campo.value)">
        <label class="sr-only" for="codigo-reserva">Código de la reserva</label>
        <input
          #campo
          id="codigo-reserva"
          class="h-10 w-40 rounded-boton border border-borde bg-papel px-3 text-[15px] uppercase tracking-[0.12em]"
          placeholder="K7MQ-2XTR"
          autocomplete="off"
          autocapitalize="characters"
          maxlength="10"
        />
        <ui-boton tipo="submit" variante="primario" tamano="sm">Buscar</ui-boton>
        <ui-boton tamano="sm" (presionado)="abierto.set(false)">Cancelar</ui-boton>
        @if (error(); as mensaje) {
          <p class="w-full text-[12.5px] text-ocupada" role="alert">{{ mensaje }}</p>
        }
      </form>
    }
  `,
})
export class IngresarCodigo {
  private readonly router = inject(Router);

  protected readonly abierto = signal(false);
  protected readonly error = signal<string | null>(null);

  protected ir(bruto: string): void {
    const codigo = normalizarCodigo(bruto);
    if (!codigo) {
      this.error.set('El código tiene 8 caracteres, como K7MQ-2XTR');
      return;
    }
    this.error.set(null);
    void this.router.navigate(['/propietario/acceso', codigo]);
  }
}
```

En `Front/src/app/components/reserva/index.ts`, agregar:

```ts
export * from './ingresar-codigo/ingresar-codigo';
```

- [ ] **Step 4: Usarlo en el tablero y en Reservas recibidas**

En `tablero.ts` y `reservas.ts`, sumar `IngresarCodigo` al import de `@app/components/reserva` (o agregar ese import) y al array `imports`.

En `tablero.html`, dentro del `<header>`, como último hijo (a la derecha del saludo):

```html
    <app-ingresar-codigo />
```

En `reservas.html`, dentro del `<header>`, como último hijo:

```html
      <app-ingresar-codigo />
```

- [ ] **Step 5: Compilar y correr los tests**

Run: `cd Front && npx ng build --configuration development && npx ng test --watch=false`
Expected: build sin errores y tests PASS.

- [ ] **Step 6: Probar a mano el flujo completo**

Con back y front levantados:
1. Un conductor reserva y el propietario confirma.
2. Correr la reserva a "ahora": `UPDATE reserva SET inicio = now() - interval '5 minutes', fin = now() + interval '1 hour' WHERE id_reserva = '<id>';`
3. El conductor abre "Ver QR". Escanearlo con otro celular (o abrir `/propietario/acceso/<codigo>` con la sesión del propietario): aparece "Registrar ingreso". Confirmar: "Ingreso registrado" con la cochera, la patente y la hora.
4. Volver a abrir la misma URL: aparece "Registrar egreso". Confirmar antes de que pase un minuto: error "Acabas de registrar el ingreso…". Esperar un minuto y confirmar: "Egreso registrado".
5. Cerrar sesión, abrir `/propietario/acceso/<codigo>`, loguearse como propietario y verificar que vuelve a esa pantalla. Si no vuelve, revisar que `pages/ingresar/ingresar.ts` navegue a `queryParams.redirigir` después del login y corregirlo ahí.
6. En el tablero, "Ingresar código" con `k7mq 2xtr` (cualquier formato) navega a la pantalla; con `abc` muestra el error de formato.
7. Los botones por reserva del tablero y de "Reservas recibidas" siguen funcionando (acción simulada del operador).

- [ ] **Step 7: Commit**

Antes de commitear, `git status`: si `pages/propietario/reservas/*` todavía tiene los cambios ajenos sin commitear (ver Global Constraints), pará y pedí que se commiteen primero, así este commit no se los lleva.

```bash
git add Front/src/app/app.routes.ts Front/src/app/pages/propietario/acceso Front/src/app/components/reserva Front/src/app/pages/propietario/tablero Front/src/app/pages/propietario/reservas
git commit -m "Pantalla del operador para registrar ingreso y egreso con el QR o el codigo"
```
