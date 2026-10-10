# Abonos mensuales por turno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El propietario ofrece planes de abono por turno (mañana, tarde, noche) con una cantidad de usos y un precio. El conductor compra uno pagando por adelantado y después reserva gratis dentro de ese turno, y cada reserva descuenta un uso.

**Architecture:** El abono **no es una reserva anticipada**: es un crédito prepago. `plan_abono` guarda lo que ofrece el propietario y `abono` lo que compró el conductor, con turno, usos y precio copiados del plan. Una reserva con abono pasa por el mismo `reserva.service.js: crear` de siempre, con `id_abono`. Antes de reservar se bloquea el abono (`FOR UPDATE`), se valida el turno, la vigencia y los usos restantes, y la reserva nace CONFIRMADA con precio 0. Los usos consumidos no se guardan: se cuentan como las reservas del abono que no están CANCELADAS.

**Tech Stack:**
- Back: Node + Express + PostgreSQL (`pg`), pruebas con `node --test` contra la base de `DATABASE_URL`.
- Front: Angular 21 (standalone, signals, `rxResource`), Tailwind 4 y Vitest (`ng test`).

**Spec:** `docs/superpowers/specs/2026-10-07-ingreso-codigo-y-abonos-design.md` (Parte B)

**Depende de:** el plan de la Parte A (`2026-10-07-ingreso-por-codigo.md`). Las reservas con abono tienen su propio código y QR sin cambios extra.

## Global Constraints

- Turnos **(supuesto de la spec, pregunta 1)**: `MANANA` 06:00–12:00, `TARDE` 12:00–18:00, `NOCHE` 18:00–24:00. Constantes en `Back/src/utils/turnos.js` con espejo en `Front/src/app/models/abono.model.ts`.
- Vigencia **(supuesto, pregunta 3)**: 30 días corridos desde la compra, contados en hora argentina (`desde` = hoy, `hasta` = hoy + 29).
- Una reserva con abono consume 1 uso sin importar su duración **(supuesto, pregunta 2)**; al cancelarse lo devuelve **(supuesto, pregunta 4)**.
- El abono no garantiza lugar: si no hay cochera, la reserva se rechaza como cualquier otra **(supuesto, pregunta 5)**.
- La reserva con abono nace CONFIRMADA, `modalidad = 'ABONO'`, `precio_total = 0` **(supuesto, pregunta 6)**.
- Un solo plan activo por turno y estacionamiento.
- Orden de bloqueo en `crear`: abono → vehículo → cocheras. Siempre el mismo, para no generar deadlocks.
- Mensajes del back sin tildes; los del front en español rioplatense.
- Commits sin trailer `Co-Authored-By`. Rama: `feat/ingreso-codigo-y-abonos`.

Si los profesores responden distinto alguna de las preguntas abiertas de la spec, el cambio queda acotado a la constante o a la regla marcada como supuesto.

## Review Focus

1. **Dos reservas simultáneas por el último uso:** solo una puede crearse. Prueba en la Task 4.
2. **Reserva que cruza el borde del turno** (11:00 a 13:00 con abono de mañana): 409 con el horario del turno. Prueba de la función pura en la Task 1 y de integración en la Task 4.
3. **Abono VIGENTE en la base pero vencido por fecha** (el job todavía no corrió): reservar para un día posterior a `hasta` tiene que fallar igual. Prueba en la Task 4.
4. **Cambiar el plan después de vender abonos:** los abonos ya vendidos conservan sus usos y su precio. Prueba en la Task 3.
5. **Usar el abono de otro conductor** (id adivinado): 404, sin revelar que existe. Prueba en la Task 4.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `Back/src/db/schema.sql` | Enums, `plan_abono`, `abono`, `reserva.id_abono`, modalidad `ABONO` |
| `Back/src/utils/turnos.js` (nuevo) | `TURNOS`, `NOMBRES_TURNO`, `motivoFueraDeTurno` (puras) |
| `Back/src/services/abono.service.js` (nuevo) | Planes, compra, listados, cancelación, vencimiento y validación para reservar |
| `Back/src/validators/abono.validator.js` (nuevo) | Validación de planes y compra |
| `Back/src/controllers/abono.controller.js` (nuevo) | Endpoints de planes y abonos |
| `Back/src/routes/abono.routes.js` (nuevo), `estacionamiento.routes.js`, `routes/index.js` | Rutas |
| `Back/src/services/reserva.service.js`, `validators/reserva.validator.js` | Reservar con `id_abono`; `id_abono` y turno en el detalle |
| `Back/src/jobs/vencimientos.job.js` | Vencer abonos |
| `Back/pruebas/ayuda.mjs` | Limpieza de abonos y planes |
| `Back/pruebas/turnos.test.mjs`, `Back/pruebas/abono.test.mjs` (nuevos) | Pruebas |
| `Front/src/app/models/abono.model.ts` (nuevo), `models/reserva.model.ts`, `services/api/*` | Tipos y mapeo |
| `Front/src/app/services/abono.service.ts` (nuevo), `services/reserva.service.ts` | HTTP |
| `Front/src/app/components/estacionamiento/planes-abono/` (nuevo) | Sección "Abonos" del propietario |
| `Front/src/app/pages/conductor/abonos/`, `planes-estacionamiento/`, `reservar-con-abono/` (nuevos) | Pantallas del conductor |

---

### Task 1: Modelo de datos y turnos

**Files:**
- Modify: `Back/src/db/schema.sql` (al final)
- Create: `Back/src/utils/turnos.js`
- Test: `Back/pruebas/turnos.test.mjs`

**Interfaces:**
- Produces:
  - Tablas `plan_abono` y `abono`, la columna `reserva.id_abono` y el valor `'ABONO'` en `modalidad_reserva`.
  - `TURNOS: { MANANA|TARDE|NOCHE: { etiqueta, desde, hasta } }` y `NOMBRES_TURNO: string[]`.
  - `motivoFueraDeTurno(turno: string, inicio: Date, fin: Date): string | null`.

- [ ] **Step 1: Escribir la prueba que falla**

`Back/pruebas/turnos.test.mjs`:

```js
// Turnos de los abonos: regla pura de "la reserva cae dentro del turno".
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { instanteLocal } from '../src/utils/horario.js';
import { motivoFueraDeTurno } from '../src/utils/turnos.js';

const dia = '2026-10-14';
const en = (desde, hasta) => [instanteLocal(dia, desde), instanteLocal(dia, hasta)];

describe('motivoFueraDeTurno', () => {
  test('dentro del turno, incluidos los bordes', () => {
    assert.equal(motivoFueraDeTurno('MANANA', ...en('08:00', '10:00')), null);
    assert.equal(motivoFueraDeTurno('MANANA', ...en('06:00', '12:00')), null);
    assert.equal(motivoFueraDeTurno('TARDE', ...en('12:00', '13:00')), null);
  });

  test('la noche termina a la medianoche', () => {
    const inicio = instanteLocal(dia, '22:00');
    const medianoche = instanteLocal('2026-10-15', '00:00');
    assert.equal(motivoFueraDeTurno('NOCHE', inicio, medianoche), null);
  });

  test('empieza antes o termina despues del turno', () => {
    assert.match(motivoFueraDeTurno('MANANA', ...en('05:00', '07:00')), /turno manana \(06:00 a 12:00\)/);
    assert.match(motivoFueraDeTurno('MANANA', ...en('11:00', '13:00')), /turno manana/);
    assert.match(motivoFueraDeTurno('TARDE', ...en('10:00', '11:00')), /turno tarde/);
  });

  test('no puede pasar al dia siguiente', () => {
    const inicio = instanteLocal(dia, '23:00');
    const otroDia = instanteLocal('2026-10-15', '01:00');
    assert.match(motivoFueraDeTurno('NOCHE', inicio, otroDia), /mismo dia/);
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd Back && node --test pruebas/turnos.test.mjs`
Expected: FAIL con `Cannot find module '../src/utils/turnos.js'`

- [ ] **Step 3: Implementar el util**

`Back/src/utils/turnos.js`:

```js
// Turnos de los abonos. Funciones puras: sin base ni red.
// El horario de cada turno es un supuesto de la spec (pregunta 1); el front
// tiene el espejo en Front/src/app/models/abono.model.ts.
import { partesLocales, sumarDias } from './horario.js';

export const TURNOS = Object.freeze({
  MANANA: Object.freeze({ etiqueta: 'manana', desde: '06:00', hasta: '12:00' }),
  TARDE: Object.freeze({ etiqueta: 'tarde', desde: '12:00', hasta: '18:00' }),
  NOCHE: Object.freeze({ etiqueta: 'noche', desde: '18:00', hasta: '24:00' }),
});

export const NOMBRES_TURNO = Object.freeze(Object.keys(TURNOS));

/**
 * Motivo por el que [inicio, fin) no cae dentro del turno, o null si cae.
 * Las horas se comparan como texto 'HH:MM' en hora argentina; un fin justo a
 * la medianoche cuenta como '24:00' del mismo dia (el borde de la noche).
 */
export function motivoFueraDeTurno(turno, inicio, fin) {
  const t = TURNOS[turno];
  const desde = partesLocales(inicio);
  const hasta = partesLocales(fin);

  const finEsMedianoche = hasta.hora === '00:00' && hasta.fecha === sumarDias(desde.fecha, 1);
  if (hasta.fecha !== desde.fecha && !finEsMedianoche) {
    return 'La reserva con abono tiene que empezar y terminar el mismo dia';
  }

  const horaHasta = finEsMedianoche ? '24:00' : hasta.hora;
  if (desde.hora < t.desde || horaHasta > t.hasta) {
    return `La reserva tiene que estar dentro del turno ${t.etiqueta} (${t.desde} a ${t.hasta})`;
  }
  return null;
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd Back && node --test pruebas/turnos.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Migración**

Agregar al final de `Back/src/db/schema.sql`:

```sql
-- Abonos (Parte B de docs/superpowers/specs/2026-10-07-ingreso-codigo-y-abonos-design.md).
-- No son reservas anticipadas: el conductor paga por adelantado un cupo de
-- usos en un turno y despues reserva gratis dentro de ese turno. Cada reserva
-- con abono descuenta un uso. Los usos consumidos no se guardan: son las
-- reservas del abono que no estan CANCELADAS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turno_abono') THEN
    CREATE TYPE turno_abono AS ENUM ('MANANA', 'TARDE', 'NOCHE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_abono') THEN
    CREATE TYPE estado_abono AS ENUM ('VIGENTE', 'CANCELADO', 'VENCIDO');
  END IF;
END
$$;

ALTER TYPE modalidad_reserva ADD VALUE IF NOT EXISTS 'ABONO';

-- Lo que ofrece el propietario: un plan activo por turno.
CREATE TABLE IF NOT EXISTS plan_abono (
  id_plan            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estacionamiento UUID          NOT NULL,
  turno              turno_abono   NOT NULL,
  cupos              SMALLINT      NOT NULL,
  precio             DECIMAL(10, 2) NOT NULL,
  activo             BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT plan_abono_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE CASCADE,
  CONSTRAINT plan_abono_cupos_positivos CHECK (cupos > 0),
  CONSTRAINT plan_abono_precio_no_negativo CHECK (precio >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_abono_un_activo_por_turno
  ON plan_abono (id_estacionamiento, turno) WHERE activo;

-- Lo que compro el conductor. Turno, cupos y precio se copian del plan al
-- comprar, para que un cambio posterior del plan no altere lo ya vendido.
CREATE TABLE IF NOT EXISTS abono (
  id_abono           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conductor       UUID          NOT NULL,
  id_estacionamiento UUID          NOT NULL,
  id_plan            UUID          NOT NULL,
  turno              turno_abono   NOT NULL,
  cupos_totales      SMALLINT      NOT NULL,
  precio_total       DECIMAL(10, 2) NOT NULL,
  desde              DATE          NOT NULL,
  hasta              DATE          NOT NULL,
  estado             estado_abono  NOT NULL DEFAULT 'VIGENTE',
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT abono_conductor_fk
    FOREIGN KEY (id_conductor) REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
  CONSTRAINT abono_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE RESTRICT,
  CONSTRAINT abono_plan_fk
    FOREIGN KEY (id_plan) REFERENCES plan_abono (id_plan) ON DELETE RESTRICT,
  CONSTRAINT abono_cupos_positivos CHECK (cupos_totales > 0),
  CONSTRAINT abono_rango_valido CHECK (hasta >= desde)
);

CREATE INDEX IF NOT EXISTS idx_abono_conductor       ON abono (id_conductor);
CREATE INDEX IF NOT EXISTS idx_abono_estacionamiento ON abono (id_estacionamiento);

ALTER TABLE reserva
  ADD COLUMN IF NOT EXISTS id_abono UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reserva_abono_fk') THEN
    ALTER TABLE reserva ADD CONSTRAINT reserva_abono_fk
      FOREIGN KEY (id_abono) REFERENCES abono (id_abono) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_reserva_abono ON reserva (id_abono) WHERE id_abono IS NOT NULL;
```

- [ ] **Step 6: Aplicar la migración dos veces (es idempotente)**

Run: `cd Back && npm run db:migrate && npm run db:migrate`
Expected: dos veces `[migrate] listo`, sin errores.

- [ ] **Step 7: Limpieza de las pruebas**

En `Back/pruebas/ayuda.mjs`, dentro de `borrarDatosDePrueba`, justo después del `DELETE FROM reserva ...` (las reservas apuntan a los abonos y los abonos a los planes):

```js
  await query(
    `DELETE FROM abono WHERE id_conductor IN (${usuarios}) OR id_estacionamiento IN (${propios})`,
    [deLaSuite],
  );
  await query(`DELETE FROM plan_abono WHERE id_estacionamiento IN (${propios})`, [deLaSuite]);
```

- [ ] **Step 8: Correr toda la suite**

Run: `cd Back && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add Back/src/db/schema.sql Back/src/utils/turnos.js Back/pruebas/turnos.test.mjs Back/pruebas/ayuda.mjs
git commit -m "Modelo de abonos por turno: planes, abonos comprados y turnos"
```

---

### Task 2: Planes de abono del propietario

**Files:**
- Create: `Back/src/services/abono.service.js`
- Create: `Back/src/validators/abono.validator.js`
- Create: `Back/src/controllers/abono.controller.js`
- Modify: `Back/src/routes/estacionamiento.routes.js`
- Test: `Back/pruebas/abono.test.mjs` (nuevo)

**Interfaces:**
- Consumes: `asegurarPropiedad` (existente), `NOMBRES_TURNO` (Task 1).
- Produces:
  - `GET /api/estacionamientos/:id/planes-abono` (público) → `{ planes: PlanDto[] }`, solo los activos, ordenados por turno.
  - `POST /api/estacionamientos/:id/planes-abono` (PROPIETARIO dueño), body `{ turno, cupos, precio }` → `201 { plan }`; 409 si ya hay uno activo de ese turno.
  - `PATCH /api/estacionamientos/:id/planes-abono/:idPlan`, body `{ cupos?, precio? }` → `{ plan }`.
  - `DELETE /api/estacionamientos/:id/planes-abono/:idPlan` → `204` (baja lógica).
  - `PlanDto = { id_plan, id_estacionamiento, turno, cupos, precio, activo }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`Back/pruebas/abono.test.mjs`:

```js
// Abonos por turno: planes, compra y reservas con abono.
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
  query,
} from './ayuda.mjs';

before(() => levantarApi('abono'));
after(() => cerrarApi());

const rutaPlanes = (estacionamiento) =>
  `/estacionamientos/${estacionamiento.id_estacionamiento}/planes-abono`;

const crearPlan = (propietario, estacionamiento, plan = { turno: 'MANANA', cupos: 2, precio: 30000 }) =>
  api('POST', rutaPlanes(estacionamiento), { token: propietario.token, body: plan });

describe('planes de abono', () => {
  test('el propietario ofrece un plan por turno y se ve en publico', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const manana = await crearPlan(propietario, estacionamiento);
    await crearPlan(propietario, estacionamiento, { turno: 'NOCHE', cupos: 10, precio: 50000 });

    assert.equal(manana.estado, 201);
    assert.equal(manana.datos.plan.turno, 'MANANA');
    assert.equal(manana.datos.plan.cupos, 2);
    assert.equal(manana.datos.plan.precio, 30000);

    const publicos = await api('GET', rutaPlanes(estacionamiento));
    assert.deepEqual(publicos.datos.planes.map((p) => p.turno), ['MANANA', 'NOCHE']);
  });

  test('un segundo plan activo del mismo turno da 409', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    await crearPlan(propietario, estacionamiento);

    const repetido = await crearPlan(propietario, estacionamiento);

    assert.equal(repetido.estado, 409);
    assert.match(motivo(repetido), /ya hay un plan activo/i);
  });

  test('editar y dar de baja; despues se puede volver a ofrecer el turno', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const { datos } = await crearPlan(propietario, estacionamiento);
    const ruta = `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`;

    const editado = await api('PATCH', ruta, { token: propietario.token, body: { cupos: 5 } });
    assert.equal(editado.datos.plan.cupos, 5);

    assert.equal((await api('DELETE', ruta, { token: propietario.token })).estado, 204);
    assert.equal((await api('GET', rutaPlanes(estacionamiento))).datos.planes.length, 0);
    assert.equal((await crearPlan(propietario, estacionamiento)).estado, 201);
  });

  test('datos invalidos: 400', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    for (const plan of [
      { turno: 'MADRUGADA', cupos: 2, precio: 100 },
      { turno: 'MANANA', cupos: 0, precio: 100 },
      { turno: 'MANANA', cupos: 2, precio: -1 },
    ]) {
      assert.equal((await crearPlan(propietario, estacionamiento, plan)).estado, 400, JSON.stringify(plan));
    }
  });

  test('otro propietario no puede crear ni tocar planes ajenos', async () => {
    const duenio = await crearUsuario({ rol: 'PROPIETARIO' });
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(duenio.token);
    const { datos } = await crearPlan(duenio, estacionamiento);

    assert.equal((await crearPlan(otro, estacionamiento, { turno: 'TARDE', cupos: 1, precio: 1 })).estado, 403);
    const ruta = `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`;
    assert.equal((await api('PATCH', ruta, { token: otro.token, body: { cupos: 9 } })).estado, 403);
    assert.equal((await api('DELETE', ruta, { token: otro.token })).estado, 403);
  });
});
```

(`crearVehiculo`, `franja` y `query` se usan en las Tasks 3 y 4.)

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: FAIL. Las rutas no existen (404).

- [ ] **Step 3: Servicio (parte de planes)**

`Back/src/services/abono.service.js`:

```js
// Abonos por turno. El abono no es una reserva anticipada: es un cupo de usos
// prepago. Con el, el conductor reserva gratis dentro de su turno y cada
// reserva descuenta un uso (ver validarAbonoParaReservar y reserva.service.js).
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';

const CAMPOS_PLAN = 'id_plan, id_estacionamiento, turno::text AS turno, cupos, precio, activo';

/* --------------------------------- planes --------------------------------- */

/** Planes que se pueden comprar hoy: los activos, en orden manana, tarde, noche. */
export async function listarPlanes(idEstacionamiento) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PLAN} FROM plan_abono
      WHERE id_estacionamiento = $1 AND activo
      ORDER BY turno`,
    [idEstacionamiento],
  );
  return rows;
}

export async function crearPlan(idEstacionamiento, idPropietario, { turno, cupos, precio }) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  try {
    const { rows } = await query(
      `INSERT INTO plan_abono (id_estacionamiento, turno, cupos, precio)
       VALUES ($1, $2, $3, $4)
       RETURNING ${CAMPOS_PLAN}`,
      [idEstacionamiento, turno, cupos, precio],
    );
    return rows[0];
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict(`Ya hay un plan activo para el turno ${turno.toLowerCase()}`);
    }
    throw error;
  }
}

/** Cambia usos y/o precio. Los abonos ya vendidos no cambian: copiaron el plan al comprar. */
export async function actualizarPlan(idEstacionamiento, idPropietario, idPlan, cambios) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const sets = [];
  const valores = [];
  for (const campo of ['cupos', 'precio']) {
    if (cambios[campo] === undefined) continue;
    valores.push(cambios[campo]);
    sets.push(`${campo} = $${valores.length}`);
  }
  valores.push(idPlan, idEstacionamiento);

  const { rows } = await query(
    `UPDATE plan_abono SET ${sets.join(', ')}
      WHERE id_plan = $${valores.length - 1} AND id_estacionamiento = $${valores.length} AND activo
      RETURNING ${CAMPOS_PLAN}`,
    valores,
  );
  if (!rows[0]) throw ApiError.notFound('El plan no existe en este estacionamiento');
  return rows[0];
}

/** Baja logica: los abonos vendidos lo referencian. Libera el turno para un plan nuevo. */
export async function darDeBajaPlan(idEstacionamiento, idPropietario, idPlan) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rowCount } = await query(
    `UPDATE plan_abono SET activo = FALSE
      WHERE id_plan = $1 AND id_estacionamiento = $2 AND activo`,
    [idPlan, idEstacionamiento],
  );
  if (rowCount === 0) throw ApiError.notFound('El plan no existe en este estacionamiento');
}
```

- [ ] **Step 4: Validadores**

`Back/src/validators/abono.validator.js`:

```js
import { NOMBRES_TURNO } from '../utils/turnos.js';
import { campos } from './helpers.js';

const OPCIONES_CUPOS = { min: 1, max: 100 };
const OPCIONES_PRECIO = { min: 0, max: 99_999_999 };

export function validarPlanAbono(body) {
  return campos(body)
    .enumerado('turno', body.turno, NOMBRES_TURNO)
    .entero('cupos', body.cupos, OPCIONES_CUPOS)
    .numero('precio', body.precio, OPCIONES_PRECIO)
    .resultado();
}

/** PATCH: el turno no se cambia (para eso se da de baja y se crea otro). */
export function validarCambiosPlanAbono(body) {
  return campos(body)
    .entero('cupos', body.cupos, { ...OPCIONES_CUPOS, requerido: false })
    .numero('precio', body.precio, { ...OPCIONES_PRECIO, requerido: false })
    .verificar(body.cupos !== undefined || body.precio !== undefined, 'cupos', 'enviar cupos y/o precio')
    .resultado();
}

export function validarCompraAbono(body) {
  return campos(body).uuid('id_plan', body.id_plan).resultado();
}
```

- [ ] **Step 5: Controlador y rutas**

`Back/src/controllers/abono.controller.js`:

```js
import * as abonoService from '../services/abono.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listarPlanes = asyncHandler(async (req, res) => {
  res.json({ planes: await abonoService.listarPlanes(req.params.id) });
});

export const crearPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.crearPlan(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ plan });
});

export const actualizarPlan = asyncHandler(async (req, res) => {
  const plan = await abonoService.actualizarPlan(req.params.id, req.usuario.id, req.params.idPlan, req.body);
  res.json({ plan });
});

export const darDeBajaPlan = asyncHandler(async (req, res) => {
  await abonoService.darDeBajaPlan(req.params.id, req.usuario.id, req.params.idPlan);
  res.status(204).end();
});
```

En `Back/src/routes/estacionamiento.routes.js`:
- Agregar `import * as abonoController from '../controllers/abono.controller.js';`.
- Agregar `import { validarCambiosPlanAbono, validarPlanAbono } from '../validators/abono.validator.js';`.
- Al final, antes de `export default router;`:

```js
// Abonos: los planes que ofrece el propietario (uno activo por turno).
router.get('/:id/planes-abono', abonoController.listarPlanes);

router.post(
  '/:id/planes-abono',
  ...soloPropietario,
  validate(validarPlanAbono),
  abonoController.crearPlan,
);

router.patch(
  '/:id/planes-abono/:idPlan',
  ...soloPropietario,
  validate(validarCambiosPlanAbono),
  abonoController.actualizarPlan,
);

router.delete('/:id/planes-abono/:idPlan', ...soloPropietario, abonoController.darDeBajaPlan);
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add Back/src/services/abono.service.js Back/src/validators/abono.validator.js Back/src/controllers/abono.controller.js Back/src/routes/estacionamiento.routes.js Back/pruebas/abono.test.mjs
git commit -m "Planes de abono por turno del propietario"
```

---

### Task 3: Compra, listado, cancelación y vencimiento de abonos

**Files:**
- Modify: `Back/src/services/abono.service.js`
- Modify: `Back/src/controllers/abono.controller.js`
- Create: `Back/src/routes/abono.routes.js`
- Modify: `Back/src/routes/index.js`, `Back/src/routes/estacionamiento.routes.js`
- Modify: `Back/src/jobs/vencimientos.job.js`
- Test: `Back/pruebas/abono.test.mjs`

**Interfaces:**
- Consumes: planes (Task 2), `validarCompraAbono` (Task 2).
- Produces:
  - `POST /api/abonos` (CONDUCTOR), body `{ id_plan }` → `201 { abono: AbonoDto }`.
  - `GET /api/abonos` (CONDUCTOR) → `{ abonos: AbonoDto[] }`, los más nuevos primero.
  - `PATCH /api/abonos/:id/cancelar` (CONDUCTOR) → `{ abono }`.
  - `GET /api/estacionamientos/:id/abonos` (PROPIETARIO dueño) → `{ abonos }`.
  - `AbonoDto = { id_abono, id_conductor, conductor_nombre, conductor_apellido, id_estacionamiento, estacionamiento, id_plan, turno, cupos_totales, cupos_usados, cupos_restantes, precio_total, desde, hasta, estado, created_at }`, con `desde` y `hasta` como texto `YYYY-MM-DD`.
  - `vencerAbonos(): Promise<number>`, que llama el job.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `Back/pruebas/abono.test.mjs`:

```js
/** Estacionamiento con un plan de manana (2 usos) y un conductor que lo compro. */
async function escenario({ cocheras = 1, cupos = 2 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const { datos } = await crearPlan(propietario, estacionamiento, { turno: 'MANANA', cupos, precio: 30000 });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const compra = await api('POST', '/abonos', { token: conductor.token, body: { id_plan: datos.plan.id_plan } });
  return { propietario, estacionamiento, plan: datos.plan, conductor, vehiculo, abono: compra.datos.abono };
}

describe('comprar y administrar abonos', () => {
  test('comprar un plan crea un abono vigente por 30 dias con los datos del plan', async () => {
    const { abono, plan, estacionamiento } = await escenario();

    assert.equal(abono.estado, 'VIGENTE');
    assert.equal(abono.id_plan, plan.id_plan);
    assert.equal(abono.id_estacionamiento, estacionamiento.id_estacionamiento);
    assert.equal(abono.turno, 'MANANA');
    assert.equal(abono.cupos_totales, 2);
    assert.equal(abono.cupos_usados, 0);
    assert.equal(abono.cupos_restantes, 2);
    assert.equal(abono.precio_total, 30000);
    const dias = (Date.parse(abono.hasta) - Date.parse(abono.desde)) / 86_400_000;
    assert.equal(dias, 29);
  });

  test('cambiar el plan despues no cambia el abono vendido', async () => {
    const { propietario, estacionamiento, plan, conductor } = await escenario();
    await api('PATCH', `${rutaPlanes(estacionamiento)}/${plan.id_plan}`, {
      token: propietario.token,
      body: { cupos: 50, precio: 1 },
    });

    const { datos } = await api('GET', '/abonos', { token: conductor.token });

    assert.equal(datos.abonos[0].cupos_totales, 2);
    assert.equal(datos.abonos[0].precio_total, 30000);
  });

  test('no se compra un plan dado de baja ni uno inexistente', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const { datos } = await crearPlan(propietario, estacionamiento);
    await api('DELETE', `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`, { token: propietario.token });
    const conductor = await crearUsuario();

    const deBaja = await api('POST', '/abonos', { token: conductor.token, body: { id_plan: datos.plan.id_plan } });
    const inexistente = await api('POST', '/abonos', {
      token: conductor.token,
      body: { id_plan: crypto.randomUUID() },
    });

    assert.equal(deBaja.estado, 404);
    assert.equal(inexistente.estado, 404);
  });

  test('el propietario ve los abonos vendidos de su estacionamiento; otro no', async () => {
    const { propietario, estacionamiento, abono } = await escenario();
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/abonos`;

    const vendidos = await api('GET', ruta, { token: propietario.token });
    assert.deepEqual(vendidos.datos.abonos.map((a) => a.id_abono), [abono.id_abono]);

    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    assert.equal((await api('GET', ruta, { token: otro.token })).estado, 403);
  });

  test('cancelar el abono: queda CANCELADO y otro conductor no puede cancelarlo', async () => {
    const { conductor, abono } = await escenario();
    const ajeno = await crearUsuario();

    const intento = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: ajeno.token });
    assert.equal(intento.estado, 404);

    const { estado, datos } = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    assert.equal(estado, 200);
    assert.equal(datos.abono.estado, 'CANCELADO');

    const otraVez = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    assert.equal(otraVez.estado, 409);
  });

  test('vencerAbonos pasa a VENCIDO los que terminaron', async () => {
    const { abono } = await escenario();
    await query(
      `UPDATE abono SET desde = current_date - 40, hasta = current_date - 11 WHERE id_abono = $1`,
      [abono.id_abono],
    );

    const { vencerAbonos } = await import('../src/services/abono.service.js');
    await vencerAbonos();

    const { rows } = await query('SELECT estado::text FROM abono WHERE id_abono = $1', [abono.id_abono]);
    assert.equal(rows[0].estado, 'VENCIDO');
  });
});
```

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: los tests de planes pasan y los nuevos fallan (404 en `/abonos`, `vencerAbonos` no existe).

- [ ] **Step 3: Servicio (parte de abonos)**

En `Back/src/services/abono.service.js`, cambiar el import de la base a `import { query, withTransaction } from '../config/database.js';` y agregar al final:

```js
/* --------------------------------- abonos --------------------------------- */

/** Vigencia en dias corridos desde la compra (supuesto de la spec, pregunta 3). */
export const DIAS_VIGENCIA = 30;

const ESTADOS_ABONO = Object.freeze({ VIGENTE: 'VIGENTE', CANCELADO: 'CANCELADO', VENCIDO: 'VENCIDO' });

/** "Hoy" del negocio: la fecha en Argentina, no la del servidor. */
const HOY_LOCAL = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

/**
 * `desde`/`hasta` van como texto: pg convierte un DATE en un Date de JS a la
 * medianoche del servidor y la fecha se puede correr un dia. Los usos
 * consumidos se cuentan de las reservas, no se guardan.
 */
const SELECT_ABONO = `
  SELECT a.id_abono, a.id_conductor, u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
         a.id_estacionamiento, e.nombre AS estacionamiento, a.id_plan,
         a.turno::text AS turno, a.cupos_totales, a.precio_total,
         a.desde::text AS desde, a.hasta::text AS hasta, a.estado::text AS estado, a.created_at,
         (SELECT COUNT(*)::int FROM reserva r
           WHERE r.id_abono = a.id_abono AND r.estado <> 'CANCELADA') AS cupos_usados
    FROM abono a
    JOIN estacionamiento e ON e.id_estacionamiento = a.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = a.id_conductor
`;

const conRestantes = (abono) => ({ ...abono, cupos_restantes: abono.cupos_totales - abono.cupos_usados });

async function obtenerAbono(ejecutor, idAbono) {
  const { rows } = await ejecutor.query(`${SELECT_ABONO} WHERE a.id_abono = $1`, [idAbono]);
  return conRestantes(rows[0]);
}

/** El pago es simulado: comprar es crear el abono con los datos del plan copiados. */
export async function comprar(idConductor, { id_plan }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT p.id_plan, p.id_estacionamiento, p.turno, p.cupos, p.precio, p.activo,
              e.publicado, e.activo AS estacionamiento_activo
         FROM plan_abono p
         JOIN estacionamiento e ON e.id_estacionamiento = p.id_estacionamiento
        WHERE p.id_plan = $1`,
      [id_plan],
    );
    const plan = rows[0];
    if (!plan || !plan.activo) throw ApiError.notFound('El plan no existe o ya no se ofrece');
    if (!plan.publicado || !plan.estacionamiento_activo) {
      throw ApiError.conflict('El estacionamiento no esta publicado');
    }

    const { rows: creado } = await client.query(
      `INSERT INTO abono
         (id_conductor, id_estacionamiento, id_plan, turno, cupos_totales, precio_total, desde, hasta)
       VALUES ($1, $2, $3, $4, $5, $6, ${HOY_LOCAL}, ${HOY_LOCAL} + $7::int)
       RETURNING id_abono`,
      [idConductor, plan.id_estacionamiento, plan.id_plan, plan.turno, plan.cupos, plan.precio, DIAS_VIGENCIA - 1],
    );

    return obtenerAbono(client, creado[0].id_abono);
  });
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(`${SELECT_ABONO} WHERE a.id_conductor = $1 ORDER BY a.created_at DESC`, [
    idConductor,
  ]);
  return rows.map(conRestantes);
}

export async function listarPorEstacionamiento(idEstacionamiento, idPropietario) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);
  const { rows } = await query(
    `${SELECT_ABONO} WHERE a.id_estacionamiento = $1 ORDER BY a.created_at DESC`,
    [idEstacionamiento],
  );
  return rows.map(conRestantes);
}

/**
 * Cancela el abono y sus reservas que todavia no empezaron. Una ACTIVA (el
 * auto esta adentro) no se toca. No hay reembolso: el pago es simulado.
 * Igual que la baja de una cochera, las reservas se cancelan con un UPDATE
 * directo: CANCELADA no tiene efectos sobre la cochera.
 */
export async function cancelar(idAbono, idConductor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id_conductor, estado::text AS estado FROM abono WHERE id_abono = $1 FOR UPDATE',
      [idAbono],
    );
    const abono = rows[0];
    // Ajeno = inexistente: no se revela que el abono existe.
    if (!abono || abono.id_conductor !== idConductor) throw ApiError.notFound('El abono no existe');
    if (abono.estado !== ESTADOS_ABONO.VIGENTE) {
      throw ApiError.conflict(`El abono ya esta ${abono.estado.toLowerCase()}`);
    }

    await client.query(
      `UPDATE reserva SET estado = 'CANCELADA'
        WHERE id_abono = $1 AND estado IN ('PENDIENTE', 'CONFIRMADA') AND inicio > now()`,
      [idAbono],
    );
    await client.query(`UPDATE abono SET estado = 'CANCELADO' WHERE id_abono = $1`, [idAbono]);

    return obtenerAbono(client, idAbono);
  });
}

/** Abonos vigentes cuya fecha `hasta` ya paso: los llama el job de vencimientos. */
export async function vencerAbonos() {
  const { rowCount } = await query(
    `UPDATE abono SET estado = 'VENCIDO' WHERE estado = 'VIGENTE' AND hasta < ${HOY_LOCAL}`,
  );
  return rowCount;
}
```

- [ ] **Step 4: Controlador y rutas**

Al final de `Back/src/controllers/abono.controller.js`:

```js
export const comprar = asyncHandler(async (req, res) => {
  const abono = await abonoService.comprar(req.usuario.id, req.body);
  res.status(201).json({ abono });
});

export const listarMios = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorConductor(req.usuario.id) });
});

export const cancelar = asyncHandler(async (req, res) => {
  res.json({ abono: await abonoService.cancelar(req.params.id, req.usuario.id) });
});

export const listarVendidos = asyncHandler(async (req, res) => {
  res.json({ abonos: await abonoService.listarPorEstacionamiento(req.params.id, req.usuario.id) });
});
```

`Back/src/routes/abono.routes.js`:

```js
import { Router } from 'express';

import * as abonoController from '../controllers/abono.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarCompraAbono } from '../validators/abono.validator.js';

const router = Router();

const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];

router.post('/', ...soloConductor, validate(validarCompraAbono), abonoController.comprar);
router.get('/', ...soloConductor, abonoController.listarMios);
router.patch('/:id/cancelar', ...soloConductor, abonoController.cancelar);

export default router;
```

En `Back/src/routes/index.js`, agregar `import abonoRoutes from './abono.routes.js';` y `router.use('/abonos', abonoRoutes);` junto a los demás.

En `Back/src/routes/estacionamiento.routes.js`, después de las rutas de planes:

```js
router.get('/:id/abonos', ...soloPropietario, abonoController.listarVendidos);
```

- [ ] **Step 5: Job**

En `Back/src/jobs/vencimientos.job.js`:
- Agregar `import { vencerAbonos } from '../services/abono.service.js';`.
- Actualizar el comentario de cabecera con la línea `// - abono.service.js: abonos VIGENTES con \`hasta\` vencido -> VENCIDO.`.
- Reemplazar el cuerpo de `revisar` por:

```js
  try {
    const canceladas = await vencerPendientesSinConfirmar();
    const finalizadas = await vencerActivasSinEgreso();
    const desbloqueadas = await desbloquearVencidas();
    const abonosVencidos = await vencerAbonos();
    if (canceladas || finalizadas || desbloqueadas || abonosVencidos) {
      console.log(
        `[vencimientos] ${canceladas} pendiente(s) cancelada(s), ${finalizadas} activa(s) finalizada(s), ` +
          `${desbloqueadas} cochera(s) desbloqueada(s), ${abonosVencidos} abono(s) vencido(s)`,
      );
    }
  } catch (error) {
    console.error('[vencimientos] fallo la revision:', error.message);
  }
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: PASS (11 tests)

- [ ] **Step 7: Commit**

```bash
git add Back/src/services/abono.service.js Back/src/controllers/abono.controller.js Back/src/routes Back/src/jobs/vencimientos.job.js Back/pruebas/abono.test.mjs
git commit -m "Compra, listado, cancelacion y vencimiento de abonos"
```

---

### Task 4: Reservar con abono

**Files:**
- Modify: `Back/src/services/abono.service.js` (función `validarAbonoParaReservar`)
- Modify: `Back/src/services/reserva.service.js` (`SELECT_DETALLE` y `crear`)
- Modify: `Back/src/validators/reserva.validator.js`
- Test: `Back/pruebas/abono.test.mjs`

**Interfaces:**
- Consumes: `motivoFueraDeTurno` (Task 1), abonos (Task 3).
- Produces:
  - `POST /api/reservas` acepta `{ id_abono, id_vehiculo, inicio, fin }` (sin `modalidad`; `id_estacionamiento` es opcional y sale del abono). Responde `201 { reserva }` con `estado: 'CONFIRMADA'`, `modalidad: 'ABONO'`, `precio_total: 0`.
  - `id_abono` y `turno_abono` en toda respuesta que use `SELECT_DETALLE` (`null` en las reservas comunes).
  - `validarAbonoParaReservar(client, idAbono, idConductor, inicio, fin): Promise<{ id_abono, id_estacionamiento, ... }>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `Back/pruebas/abono.test.mjs`:

```js
const reservarConAbono = (conductor, abono, vehiculo, cuando) =>
  api('POST', '/reservas', {
    token: conductor.token,
    body: { id_abono: abono.id_abono, id_vehiculo: vehiculo.id_vehiculo, ...cuando },
  });

const usosRestantes = async (conductor) =>
  (await api('GET', '/abonos', { token: conductor.token })).datos.abonos[0].cupos_restantes;

describe('reservar con abono', () => {
  test('dentro del turno: CONFIRMADA, gratis y descuenta un uso', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const { estado, datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '10:00'));

    assert.equal(estado, 201);
    assert.equal(datos.reserva.estado, 'CONFIRMADA');
    assert.equal(datos.reserva.modalidad, 'ABONO');
    assert.equal(datos.reserva.precio_total, 0);
    assert.equal(datos.reserva.id_abono, abono.id_abono);
    assert.equal(datos.reserva.turno_abono, 'MANANA');
    assert.equal(await usosRestantes(conductor), 1);
  });

  test('sin usos restantes: 409', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cupos: 1 });
    await reservarConAbono(conductor, abono, vehiculo, franja('06:00', '07:00'));

    const sinUsos = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));

    assert.equal(sinUsos.estado, 409);
    assert.match(motivo(sinUsos), /no te quedan usos/i);
  });

  test('cancelar la reserva devuelve el uso', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cupos: 1 });
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('06:00', '07:00'));
    await api('PATCH', `/reservas/${datos.reserva.id_reserva}/cancelar`, { token: conductor.token });

    assert.equal(await usosRestantes(conductor), 1);
    const otra = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    assert.equal(otra.estado, 201);
  });

  test('fuera del turno o cruzando su borde: 409 con el horario del turno', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    for (const cuando of [franja('13:00', '14:00'), franja('11:00', '13:00')]) {
      const respuesta = await reservarConAbono(conductor, abono, vehiculo, cuando);
      assert.equal(respuesta.estado, 409);
      assert.match(motivo(respuesta), /turno manana \(06:00 a 12:00\)/i);
    }
  });

  test('fuera de la vigencia: 409 aunque el job no lo haya vencido', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const despues = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00', 40));

    assert.equal(despues.estado, 409);
    assert.match(motivo(despues), /el abono vale del/i);
  });

  test('abono cancelado: 409; abono de otro conductor: 404', async () => {
    const { conductor, abono, vehiculo } = await escenario();
    const ajeno = await crearUsuario();
    const vehiculoAjeno = await crearVehiculo(ajeno.token);

    const deOtro = await reservarConAbono(ajeno, abono, vehiculoAjeno, franja('08:00', '09:00'));
    assert.equal(deOtro.estado, 404);

    await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    const cancelado = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    assert.equal(cancelado.estado, 409);
  });

  test('con id_abono no se manda modalidad: 400', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const respuesta = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_abono: abono.id_abono, id_vehiculo: vehiculo.id_vehiculo, modalidad: 'HORA', ...franja() },
    });

    assert.equal(respuesta.estado, 400);
  });

  test('dos reservas simultaneas por el ultimo uso: solo una se crea', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cocheras: 2, cupos: 1 });
    const otroVehiculo = await crearVehiculo(conductor.token);

    const respuestas = await Promise.all([
      reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00')),
      reservarConAbono(conductor, abono, otroVehiculo, franja('08:00', '09:00')),
    ]);

    assert.equal(respuestas.filter((r) => r.estado === 201).length, 1);
    assert.equal(respuestas.filter((r) => r.estado === 409).length, 1);
  });

  test('sin cochera libre: 409 como cualquier reserva (el abono no garantiza lugar)', async () => {
    const { estacionamiento, conductor, abono, vehiculo } = await escenario();
    const otroConductor = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otroConductor.token);
    await api('POST', '/reservas', {
      token: otroConductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: otroVehiculo.id_vehiculo,
        ...franja('08:00', '10:00'),
      },
    });

    const respuesta = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '10:00'));

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /no quedan cocheras libres/i);
    assert.equal(await usosRestantes(conductor), 2);
  });

  test('cancelar el abono cancela sus reservas futuras', async () => {
    const { conductor, abono, vehiculo } = await escenario();
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));

    await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });

    const { rows } = await query('SELECT estado::text FROM reserva WHERE id_reserva = $1', [
      datos.reserva.id_reserva,
    ]);
    assert.equal(rows[0].estado, 'CANCELADA');
  });

  test('una reserva comun no trae abono', async () => {
    const { estacionamiento, conductor, vehiculo } = await escenario();

    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...franja('14:00', '15:00'),
      },
    });

    assert.equal(datos.reserva.id_abono, null);
    assert.equal(datos.reserva.turno_abono, null);
    assert.equal(datos.reserva.modalidad, 'HORA');
  });
});
```

- [ ] **Step 2: Correrlas y verificar que fallan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: los tests de las Tasks 2 y 3 pasan y los nuevos fallan (400 por falta de `id_estacionamiento` o `id_abono` ausente en la respuesta).

- [ ] **Step 3: Validar el abono para reservar**

En `Back/src/services/abono.service.js`, agregar los imports:

```js
import { partesLocales } from '../utils/horario.js';
import { motivoFueraDeTurno } from '../utils/turnos.js';
```

Y al final del archivo:

```js
/**
 * Reglas para reservar con el abono. Se llama dentro de la transaccion de
 * reserva.service.js: crear, ANTES de bloquear vehiculo y cocheras. El
 * FOR UPDATE serializa dos reservas con el mismo abono: la segunda espera y
 * ya cuenta el uso de la primera, asi el ultimo uso no se consume dos veces.
 */
export async function validarAbonoParaReservar(client, idAbono, idConductor, inicio, fin) {
  const { rows } = await client.query(
    `SELECT id_abono, id_conductor, id_estacionamiento, turno::text AS turno, cupos_totales,
            estado::text AS estado, desde::text AS desde, hasta::text AS hasta
       FROM abono WHERE id_abono = $1 FOR UPDATE`,
    [idAbono],
  );
  const abono = rows[0];
  if (!abono || abono.id_conductor !== idConductor) throw ApiError.notFound('El abono no existe');
  if (abono.estado !== ESTADOS_ABONO.VIGENTE) {
    throw ApiError.conflict(`El abono esta ${abono.estado.toLowerCase()}`);
  }

  // Por fecha y no solo por estado: el job puede no haberlo vencido todavia.
  const dia = partesLocales(inicio).fecha;
  if (dia < abono.desde || dia > abono.hasta) {
    throw ApiError.conflict(`El abono vale del ${abono.desde} al ${abono.hasta}`);
  }

  const motivo = motivoFueraDeTurno(abono.turno, inicio, fin);
  if (motivo) throw ApiError.conflict(motivo);

  const { rows: usados } = await client.query(
    `SELECT COUNT(*)::int AS usados FROM reserva WHERE id_abono = $1 AND estado <> 'CANCELADA'`,
    [idAbono],
  );
  if (usados[0].usados >= abono.cupos_totales) throw ApiError.conflict('No te quedan usos en este abono');

  return abono;
}
```

- [ ] **Step 4: Reservar con abono en `crear`**

En `Back/src/services/reserva.service.js`:

1. Agregar el import `import { validarAbonoParaReservar } from './abono.service.js';` y, junto a las constantes de arriba:

```js
// Modalidad de las reservas hechas con un abono: no se cobra (ya se pago el
// abono). No esta en MODALIDADES porque el conductor no la elige: sale de `id_abono`.
const MODALIDAD_ABONO = 'ABONO';
```

2. En `SELECT_DETALLE`, cambiar

```js
         r.modalidad, r.precio_total, r.motivo_reasignacion, r.codigo_acceso,
```

por

```js
         r.modalidad, r.precio_total, r.motivo_reasignacion, r.codigo_acceso,
         r.id_abono, a.turno::text AS turno_abono,
```

y agregar el join después de `JOIN usuario u ...`:

```js
    LEFT JOIN abono a      ON a.id_abono = r.id_abono
```

3. Reemplazar el principio de `crear`, desde la firma hasta antes del `let idReserva;`, por:

```js
export async function crear(
  idConductor,
  { id_cochera, id_estacionamiento, id_vehiculo, inicio, fin, modalidad = MODALIDADES.HORA, id_abono },
) {
  return withTransaction(async (client) => {
    // El abono se bloquea primero (orden fijo: abono -> vehiculo -> cocheras).
    const abono = id_abono
      ? await validarAbonoParaReservar(client, id_abono, idConductor, inicio, fin)
      : null;

    const vehiculo = await obtenerVehiculo(client, id_vehiculo, idConductor);
    await asegurarVehiculoLibre(client, id_vehiculo, inicio, fin);

    const cochera = id_cochera
      ? await bloquearCochera(client, id_cochera, vehiculo, inicio, fin)
      : await asignarCochera(client, abono?.id_estacionamiento ?? id_estacionamiento, vehiculo, inicio, fin);

    if (abono && cochera.id_estacionamiento !== abono.id_estacionamiento) {
      throw ApiError.conflict('El abono es de otro estacionamiento');
    }

    // Con abono no se cobra y se valida como una reserva por hora (todo el rango en horario).
    const precio = abono ? 0 : await precioDe(client, cochera.id_estacionamiento, modalidad, inicio, fin);
    await validarHorario(client, cochera.id_estacionamiento, inicio, fin, abono ? MODALIDADES.HORA : modalidad);
```

4. En el `INSERT` de `crear`, sumar `id_abono`:

```js
      const { rows } = await client.query(
        `INSERT INTO reserva
           (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, modalidad, precio_total, id_abono)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id_reserva`,
        [
          idConductor,
          id_vehiculo,
          cochera.id_cochera,
          inicio,
          fin,
          // Con abono ya esta paga: nace confirmada (supuesto de la spec, pregunta 6).
          abono ? ESTADOS_RESERVA.CONFIRMADA : ESTADOS_RESERVA.PENDIENTE,
          abono ? MODALIDAD_ABONO : modalidad,
          precio,
          abono?.id_abono ?? null,
        ],
      );
```

- [ ] **Step 5: Validador**

En `Back/src/validators/reserva.validator.js`, reemplazar `validarReserva` por:

```js
/**
 * La reserva se pide por estacionamiento (el backend asigna la cochera), por
 * una cochera puntual o con un abono (el estacionamiento sale del abono).
 * Sin abono tiene que venir exactamente uno de id_estacionamiento o id_cochera;
 * con abono no se manda modalidad (no se cobra).
 */
export function validarReserva(body) {
  const conAbono = vino(body.id_abono);
  const validador = campos(body)
    .uuid('id_abono', body.id_abono, { requerido: false })
    .uuid('id_estacionamiento', body.id_estacionamiento, { requerido: false })
    .uuid('id_cochera', body.id_cochera, { requerido: false })
    .uuid('id_vehiculo', body.id_vehiculo)
    .enumerado('modalidad', body.modalidad, Object.values(MODALIDADES), {
      requerido: false,
      default: MODALIDADES.HORA,
    })
    .fechaHora('inicio', body.inicio)
    .fechaHora('fin', body.fin)
    .verificar(
      conAbono || vino(body.id_estacionamiento) !== vino(body.id_cochera),
      'id_estacionamiento',
      'enviar id_estacionamiento o id_cochera (uno solo)',
    )
    .verificar(!conAbono || !vino(body.modalidad), 'modalidad', 'con id_abono no se envia modalidad');

  const { valores, errores } = validador.resultado();

  if (valores.inicio && valores.fin) {
    if (valores.fin <= valores.inicio) {
      errores.push({ campo: 'fin', mensaje: 'debe ser posterior a inicio' });
    }
    if (valores.inicio.getTime() < Date.now() - 60_000) {
      errores.push({ campo: 'inicio', mensaje: 'no puede estar en el pasado' });
    }
    const motivoDuracion = motivoDuracionInvalida(valores.modalidad, valores.inicio, valores.fin);
    if (motivoDuracion) errores.push({ campo: 'fin', mensaje: motivoDuracion });
  }

  return { valores, errores };
}
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test --env-file=.env pruebas/abono.test.mjs`
Expected: PASS (todos)

- [ ] **Step 7: Correr toda la suite**

Run: `cd Back && npm test`
Expected: PASS. Las reservas comunes siguen naciendo PENDIENTE con su precio.

- [ ] **Step 8: Commit**

```bash
git add Back/src/services/abono.service.js Back/src/services/reserva.service.js Back/src/validators/reserva.validator.js Back/pruebas/abono.test.mjs
git commit -m "Reservar gratis con un abono dentro de su turno, descontando un uso"
```

---

### Task 5: Front — modelos, mapeo y servicios

**Files:**
- Create: `Front/src/app/models/abono.model.ts`
- Modify: `Front/src/app/models/index.ts`, `models/reserva.model.ts`
- Modify: `Front/src/app/services/api/api.dto.ts`, `api.mapeo.ts`, `api.mapeo.spec.ts`
- Create: `Front/src/app/services/abono.service.ts`
- Modify: `Front/src/app/services/reserva.service.ts`, `services/index.ts`

**Interfaces:**
- Consumes: los endpoints de las Tasks 2 a 4.
- Produces:
  - Tipos `TurnoAbono`, `TURNOS`, `ORDEN_TURNOS`, `EstadoAbono`, `PlanAbono`, `NuevoPlanAbono`, `Abono` y `NuevaReservaConAbono`.
  - `Reserva.abono: { id: Id; turno: TurnoAbono } | null`.
  - `aPlanAbono`, `aAbono` y el mapeo de `aReserva` (convierte `modalidad: 'ABONO'` en `'HORA'` y completa `abono`).
  - `AbonoService`: `planes`, `crearPlan`, `actualizarPlan`, `darDeBajaPlan`, `comprar`, `misAbonos`, `cancelar` y `vendidos`.
  - `ReservaService.crearConAbono(datos): Observable<Reserva>`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar al final de `Front/src/app/services/api/api.mapeo.spec.ts` (sumá `aAbono` y `aReserva` a su import de `./api.mapeo` y `ReservaDto` al de `./api.dto` si no están):

```ts
describe('aAbono', () => {
  it('traduce el abono y sus usos', () => {
    const abono = aAbono({
      id_abono: 'a1',
      id_conductor: 'c1',
      conductor_nombre: 'Ana',
      conductor_apellido: 'Paz',
      id_estacionamiento: 'e1',
      estacionamiento: 'Centro',
      id_plan: 'p1',
      turno: 'MANANA',
      cupos_totales: 20,
      cupos_usados: 6,
      cupos_restantes: 14,
      precio_total: 40000,
      desde: '2026-10-08',
      hasta: '2026-11-06',
      estado: 'VIGENTE',
      created_at: '2026-10-08T12:00:00.000Z',
    });

    expect(abono).toMatchObject({
      id: 'a1',
      conductor: 'Ana Paz',
      estacionamiento: 'Centro',
      turno: 'MANANA',
      cuposTotales: 20,
      cuposRestantes: 14,
      hasta: '2026-11-06',
    });
  });
});

describe('aReserva con abono', () => {
  it('muestra la modalidad por hora y guarda el abono', () => {
    const reserva = aReserva({
      id_reserva: 'r1', id_conductor: 'c1',
      inicio: '2026-10-09T11:00:00.000Z', fin: '2026-10-09T13:00:00.000Z',
      estado: 'CONFIRMADA', created_at: '2026-10-08T12:00:00.000Z',
      ingreso_real: null, egreso_real: null,
      id_vehiculo: 'v1', patente: 'AB123CD', marca: null, modelo: null, id_tipo_vehiculo: 1,
      id_cochera: 'k1', cochera: 'P-1', cochera_sector: null, cochera_cubierta: false,
      id_estacionamiento: 'e1', estacionamiento: 'Centro', direccion: 'Calle 1',
      precio_total: 0, modalidad: 'ABONO', motivo_reasignacion: null,
      codigo_acceso: 'K7MQ2XTR', id_abono: 'a1', turno_abono: 'MANANA',
    } as ReservaDto);

    expect(reserva.modalidad).toBe('HORA');
    expect(reserva.abono).toEqual({ id: 'a1', turno: 'MANANA' });
  });
});
```

- [ ] **Step 2: Correrla y verificar que falla**

Run: `cd Front && npx ng test --watch=false --include src/app/services/api/api.mapeo.spec.ts`
Expected: FAIL. `aAbono` no existe.

- [ ] **Step 3: Modelos**

`Front/src/app/models/abono.model.ts`:

```ts
import { FechaISO, HoraHHmm, Id } from './api.model';

/** Turnos de los abonos. Espejo de Back/src/utils/turnos.js. */
export type TurnoAbono = 'MANANA' | 'TARDE' | 'NOCHE';

export const TURNOS: Record<TurnoAbono, { etiqueta: string; desde: HoraHHmm; hasta: HoraHHmm }> = {
  MANANA: { etiqueta: 'Mañana', desde: '06:00', hasta: '12:00' },
  TARDE: { etiqueta: 'Tarde', desde: '12:00', hasta: '18:00' },
  NOCHE: { etiqueta: 'Noche', desde: '18:00', hasta: '24:00' },
};

export const ORDEN_TURNOS: TurnoAbono[] = ['MANANA', 'TARDE', 'NOCHE'];

export type EstadoAbono = 'VIGENTE' | 'CANCELADO' | 'VENCIDO';

/** Lo que ofrece el propietario: usos y precio de un turno. */
export interface PlanAbono {
  id: Id;
  estacionamientoId: Id;
  turno: TurnoAbono;
  cupos: number;
  precio: number;
}

export interface NuevoPlanAbono {
  turno: TurnoAbono;
  cupos: number;
  precio: number;
}

/** Lo que compro el conductor: un cupo de usos prepago en un turno. */
export interface Abono {
  id: Id;
  estacionamientoId: Id;
  estacionamiento: string;
  conductor: string;
  turno: TurnoAbono;
  cuposTotales: number;
  cuposUsados: number;
  cuposRestantes: number;
  precioTotal: number;
  desde: FechaISO;
  hasta: FechaISO;
  estado: EstadoAbono;
}

/** Reserva gratis dentro del turno del abono. */
export interface NuevaReservaConAbono {
  abonoId: Id;
  vehiculoId: Id;
  fecha: FechaISO;
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
}
```

En `Front/src/app/models/index.ts`, agregar `export * from './abono.model';`.

En `Front/src/app/models/reserva.model.ts`, importar `TurnoAbono` desde `./abono.model` y, dentro de `interface Reserva`, después de `codigoAcceso`:

```ts
  /** Con que abono se hizo, o null si se pago aparte. */
  abono: { id: Id; turno: TurnoAbono } | null;
```

- [ ] **Step 4: DTO y mapeo**

En `Front/src/app/services/api/api.dto.ts` (importar `TurnoAbono` y `EstadoAbono` de `@app/models`):
- En `ReservaDto`, cambiar `modalidad: ModalidadReserva;` por `modalidad: ModalidadReserva | 'ABONO';` y agregar `id_abono: string | null;` y `turno_abono: TurnoAbono | null;`.
- Agregar:

```ts
export interface PlanAbonoDto {
  id_plan: string;
  id_estacionamiento: string;
  turno: TurnoAbono;
  cupos: number;
  precio: number;
  activo: boolean;
}

export interface AbonoDto {
  id_abono: string;
  id_conductor: string;
  conductor_nombre: string;
  conductor_apellido: string;
  id_estacionamiento: string;
  estacionamiento: string;
  id_plan: string;
  turno: TurnoAbono;
  cupos_totales: number;
  cupos_usados: number;
  cupos_restantes: number;
  precio_total: number;
  desde: string;
  hasta: string;
  estado: EstadoAbono;
  created_at: string;
}
```

En `Front/src/app/services/api/api.mapeo.ts` (sumar `Abono`, `PlanAbono` y `NuevaReservaConAbono` al import de `@app/models` y `AbonoDto` y `PlanAbonoDto` al de `./api.dto`):
- En `aReserva`, cambiar `modalidad: dto.modalidad,` por:

```ts
    // Una reserva con abono no se cobra: se muestra por hora y el abono va aparte.
    modalidad: dto.modalidad === 'ABONO' ? 'HORA' : dto.modalidad,
    abono: dto.id_abono && dto.turno_abono ? { id: dto.id_abono, turno: dto.turno_abono } : null,
```

- Agregar al final:

```ts
/* --------------------------------- abonos --------------------------------- */

export function aPlanAbono(dto: PlanAbonoDto): PlanAbono {
  return {
    id: dto.id_plan,
    estacionamientoId: dto.id_estacionamiento,
    turno: dto.turno,
    cupos: dto.cupos,
    precio: dto.precio,
  };
}

export function aAbono(dto: AbonoDto): Abono {
  return {
    id: dto.id_abono,
    estacionamientoId: dto.id_estacionamiento,
    estacionamiento: dto.estacionamiento,
    conductor: `${dto.conductor_nombre} ${dto.conductor_apellido}`,
    turno: dto.turno,
    cuposTotales: dto.cupos_totales,
    cuposUsados: dto.cupos_usados,
    cuposRestantes: dto.cupos_restantes,
    precioTotal: dto.precio_total,
    desde: dto.desde,
    hasta: dto.hasta,
    estado: dto.estado,
  };
}

export function aPayloadReservaConAbono(datos: NuevaReservaConAbono) {
  return {
    id_abono: datos.abonoId,
    id_vehiculo: datos.vehiculoId,
    inicio: aInstante(datos.fecha, datos.horaDesde),
    fin: aInstante(datos.fecha, datos.horaHasta),
  };
}
```

- [ ] **Step 5: Servicios**

`Front/src/app/services/abono.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Abono, Id, NuevoPlanAbono, PlanAbono } from '@app/models';
import { AbonoDto, PlanAbonoDto } from './api/api.dto';
import { aAbono, aPlanAbono } from './api/api.mapeo';

/** Planes de abono (propietario) y abonos comprados (conductor). */
@Injectable({ providedIn: 'root' })
export class AbonoService {
  private readonly http = inject(HttpClient);

  private rutaPlanes(estacionamientoId: Id): string {
    return `/estacionamientos/${estacionamientoId}/planes-abono`;
  }

  /** `GET /api/estacionamientos/:id/planes-abono` (publico) */
  planes(estacionamientoId: Id): Observable<PlanAbono[]> {
    return this.http
      .get<{ planes: PlanAbonoDto[] }>(this.rutaPlanes(estacionamientoId))
      .pipe(map(({ planes }) => planes.map(aPlanAbono)));
  }

  crearPlan(estacionamientoId: Id, datos: NuevoPlanAbono): Observable<PlanAbono> {
    return this.http
      .post<{ plan: PlanAbonoDto }>(this.rutaPlanes(estacionamientoId), datos)
      .pipe(map(({ plan }) => aPlanAbono(plan)));
  }

  actualizarPlan(estacionamientoId: Id, planId: Id, cambios: Partial<Pick<NuevoPlanAbono, 'cupos' | 'precio'>>): Observable<PlanAbono> {
    return this.http
      .patch<{ plan: PlanAbonoDto }>(`${this.rutaPlanes(estacionamientoId)}/${planId}`, cambios)
      .pipe(map(({ plan }) => aPlanAbono(plan)));
  }

  darDeBajaPlan(estacionamientoId: Id, planId: Id): Observable<void> {
    return this.http.delete<void>(`${this.rutaPlanes(estacionamientoId)}/${planId}`);
  }

  /** `POST /api/abonos`: el pago es simulado. */
  comprar(planId: Id): Observable<Abono> {
    return this.http.post<{ abono: AbonoDto }>('/abonos', { id_plan: planId }).pipe(map(({ abono }) => aAbono(abono)));
  }

  misAbonos(): Observable<Abono[]> {
    return this.http.get<{ abonos: AbonoDto[] }>('/abonos').pipe(map(({ abonos }) => abonos.map(aAbono)));
  }

  cancelar(abonoId: Id): Observable<Abono> {
    return this.http
      .patch<{ abono: AbonoDto }>(`/abonos/${abonoId}/cancelar`, {})
      .pipe(map(({ abono }) => aAbono(abono)));
  }

  /** `GET /api/estacionamientos/:id/abonos` (propietario) */
  vendidos(estacionamientoId: Id): Observable<Abono[]> {
    return this.http
      .get<{ abonos: AbonoDto[] }>(`/estacionamientos/${estacionamientoId}/abonos`)
      .pipe(map(({ abonos }) => abonos.map(aAbono)));
  }
}
```

En `Front/src/app/services/index.ts`, agregar `export * from './abono.service';`.

En `Front/src/app/services/reserva.service.ts`, sumar `NuevaReservaConAbono` al import de `@app/models` y `aPayloadReservaConAbono` al de `./api/api.mapeo`, y agregar debajo de `crear`:

```ts
  /** `POST /api/reservas` con `id_abono`: gratis, dentro del turno del abono. */
  crearConAbono(datos: NuevaReservaConAbono): Observable<Reserva> {
    return this.http
      .post<{ reserva: ReservaDto }>(this.ruta, aPayloadReservaConAbono(datos))
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }
```

- [ ] **Step 6: Mostrar el abono en la tarjeta de la reserva**

En `tarjeta-reserva.ts`, importar `TURNOS` de `@app/models` y agregar `protected readonly turnos = TURNOS;`. En `tarjeta-reserva.html`, dentro del `<footer>`, reemplazar el `<p class="flex items-baseline gap-2">…</p>` del precio por:

```html
      <p class="flex items-baseline gap-2">
        @if (r.abono; as abono) {
          <span class="text-[15px] font-semibold text-tinta">Abono</span>
          <span class="text-[12.5px] text-plomo">Turno {{ turnos[abono.turno].etiqueta.toLowerCase() }}</span>
        } @else {
          <span class="num-tabular text-[17px] font-semibold text-tinta">
            $ {{ r.precioTotal.toLocaleString('es-AR') }}
          </span>
          <span class="text-[12.5px] text-plomo">{{ etiquetaModalidad[r.modalidad] }}</span>
        }
      </p>
```

- [ ] **Step 7: Correr los tests y compilar**

Run: `cd Front && npx ng test --watch=false && npx ng build --configuration development`
Expected: tests PASS y build sin errores.

- [ ] **Step 8: Commit**

```bash
git add Front/src/app/models Front/src/app/services Front/src/app/components/reserva/tarjeta-reserva
git commit -m "Front: modelos, mapeo y servicios de abonos"
```

---

### Task 6: Front — planes y abonos vendidos del propietario

**Files:**
- Create: `Front/src/app/components/estacionamiento/planes-abono/planes-abono.ts`
- Modify: `Front/src/app/components/estacionamiento/index.ts`
- Modify: `Front/src/app/pages/propietario/editar-estacionamiento/editar-estacionamiento.ts` y `.html`

**Interfaces:**
- Consumes: `AbonoService` (Task 5).
- Produces: `<app-planes-abono [estacionamientoId]="..." />`.

- [ ] **Step 1: Componente**

`Front/src/app/components/estacionamiento/planes-abono/planes-abono.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Boton, Cargando } from '@app/components/ui';
import { Abono, Id, ORDEN_TURNOS, PlanAbono, TURNOS, TurnoAbono } from '@app/models';
import { AbonoService } from '@app/services/abono.service';

/**
 * Seccion "Abonos" del estacionamiento: un plan por turno (usos y precio) y
 * la lista de abonos vendidos. El abono no reserva lugar: da usos prepagos
 * para reservar gratis dentro del turno.
 */
@Component({
  selector: 'app-planes-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, DatePipe],
  template: `
    <section
      class="flex flex-col gap-4 rounded-tarjeta border border-borde bg-papel px-5 py-4 shadow-tarjeta"
      aria-labelledby="titulo-abonos"
    >
      <div>
        <h2 id="titulo-abonos" class="text-[14px] font-semibold text-tinta">Abonos mensuales</h2>
        <p class="mt-1 text-[13px] text-plomo">
          El conductor paga por adelantado una cantidad de usos en un turno y después reserva gratis
          dentro de ese horario. Vale 30 días.
        </p>
      </div>

      @if (planes.isLoading()) {
        <ui-cargando [cantidad]="1" />
      } @else {
        <div class="flex flex-col divide-y divide-borde-sutil">
          @for (turno of ordenTurnos; track turno) {
            <form
              class="flex flex-wrap items-end gap-3 py-3"
              (submit)="$event.preventDefault(); guardar(turno, cupos.valueAsNumber, precio.valueAsNumber)"
            >
              <div class="w-32">
                <p class="text-[13px] font-semibold text-tinta">{{ turnos[turno].etiqueta }}</p>
                <p class="text-[12px] text-plomo">{{ turnos[turno].desde }} a {{ turnos[turno].hasta }}</p>
              </div>
              <label class="flex flex-col gap-1 text-[12px] text-plomo">
                Usos
                <input #cupos type="number" min="1" max="100" required
                  class="h-10 w-24 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta"
                  [value]="planDe(turno)?.cupos ?? ''" />
              </label>
              <label class="flex flex-col gap-1 text-[12px] text-plomo">
                Precio ($)
                <input #precio type="number" min="0" required
                  class="h-10 w-32 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta"
                  [value]="planDe(turno)?.precio ?? ''" />
              </label>
              <ui-boton tipo="submit" variante="primario" tamano="sm" [cargando]="guardando() === turno">
                {{ planDe(turno) ? 'Guardar' : 'Ofrecer' }}
              </ui-boton>
              @if (planDe(turno); as plan) {
                <ui-boton variante="peligro" tamano="sm" (presionado)="quitar(plan)">Dejar de ofrecer</ui-boton>
              }
            </form>
          }
        </div>
      }

      @if (error(); as mensaje) {
        <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
      }

      <div>
        <h3 class="text-[13px] font-semibold text-tinta">Vendidos</h3>
        @if (vendidos.value().length === 0) {
          <p class="mt-1 text-[13px] text-plomo">Todavía no vendiste abonos.</p>
        } @else {
          <ul class="mt-2 flex flex-col gap-1.5 text-[13px]">
            @for (abono of vendidos.value(); track abono.id) {
              <li class="flex flex-wrap justify-between gap-2">
                <span class="text-tinta">{{ abono.conductor }} · {{ turnos[abono.turno].etiqueta }}</span>
                <span class="text-plomo">
                  {{ abono.cuposUsados }} de {{ abono.cuposTotales }} usos · hasta
                  {{ abono.hasta | date: 'd MMM' }} · {{ abono.estado.toLowerCase() }}
                </span>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
})
export class PlanesAbono {
  private readonly abonos = inject(AbonoService);

  readonly estacionamientoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly ordenTurnos = ORDEN_TURNOS;

  protected readonly guardando = signal<TurnoAbono | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly planes = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.planes(params),
    defaultValue: [] as PlanAbono[],
  });

  protected readonly vendidos = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.vendidos(params),
    defaultValue: [] as Abono[],
  });

  private readonly porTurno = computed(
    () => new Map(this.planes.value().map((plan) => [plan.turno, plan])),
  );

  protected planDe(turno: TurnoAbono): PlanAbono | undefined {
    return this.porTurno().get(turno);
  }

  protected guardar(turno: TurnoAbono, cupos: number, precio: number): void {
    if (!Number.isInteger(cupos) || cupos < 1 || !Number.isFinite(precio) || precio < 0) {
      this.error.set('Completá usos (1 o más) y precio (0 o más).');
      return;
    }
    const existente = this.planDe(turno);
    const llamada = existente
      ? this.abonos.actualizarPlan(this.estacionamientoId(), existente.id, { cupos, precio })
      : this.abonos.crearPlan(this.estacionamientoId(), { turno, cupos, precio });

    this.guardando.set(turno);
    this.error.set(null);
    llamada.subscribe({
      next: () => {
        this.guardando.set(null);
        this.planes.reload();
      },
      error: (e: Error) => {
        this.guardando.set(null);
        this.error.set(e.message);
      },
    });
  }

  protected quitar(plan: PlanAbono): void {
    this.error.set(null);
    this.abonos.darDeBajaPlan(this.estacionamientoId(), plan.id).subscribe({
      next: () => this.planes.reload(),
      error: (e: Error) => this.error.set(e.message),
    });
  }
}
```

En `Front/src/app/components/estacionamiento/index.ts`, agregar `export * from './planes-abono/planes-abono';`.

- [ ] **Step 2: Usarlo en la edición del estacionamiento**

En `editar-estacionamiento.ts`, sumar `PlanesAbono` al import de `@app/components/estacionamiento` y al array `imports`.

En `editar-estacionamiento.html`, justo antes de `<app-formulario-estacionamiento` (dentro del `@else` del estacionamiento activo):

```html
        <app-planes-abono [estacionamientoId]="estacionamiento.id" />
```

- [ ] **Step 3: Compilar**

Run: `cd Front && npx ng build --configuration development`
Expected: sin errores.

- [ ] **Step 4: Probar a mano**

Con un propietario, en "Editar estacionamiento": ofrecer el turno mañana con 20 usos a $40.000 (pasa a "Guardar" y aparece "Dejar de ofrecer"), cambiar los usos y guardar, dejar de ofrecerlo. Con usos en 0 aparece el error del formulario.

- [ ] **Step 5: Commit**

```bash
git add Front/src/app/components/estacionamiento Front/src/app/pages/propietario/editar-estacionamiento
git commit -m "El propietario ofrece planes de abono por turno y ve los vendidos"
```

---

### Task 7: Front — comprar, ver y usar abonos (conductor)

**Files:**
- Create: `Front/src/app/pages/conductor/abonos/abonos.ts` (Mis abonos)
- Create: `Front/src/app/pages/conductor/planes-estacionamiento/planes-estacionamiento.ts`
- Create: `Front/src/app/pages/conductor/reservar-con-abono/reservar-con-abono.ts`
- Modify: `Front/src/app/app.routes.ts` (rama `conductor`)
- Modify: `Front/src/app/layouts/layout-app/layout-app.ts` (`NAVEGACION`)
- Modify: `Front/src/app/components/estacionamiento/detalle-estacionamiento/detalle-estacionamiento.ts`

**Interfaces:**
- Consumes: `AbonoService`, `ReservaService.crearConAbono`, `VehiculoService.listarMisVehiculos` y `TURNOS` (Task 5).
- Produces: las rutas `/conductor/abonos`, `/conductor/abonos/estacionamiento/:estacionamientoId` y `/conductor/abonos/:abonoId/reservar`.

- [ ] **Step 1: Rutas y navegación**

En `Front/src/app/app.routes.ts`, dentro de `children` de `conductor`, después de `mis-reservas`:

```ts
      {
        path: 'abonos',
        title: 'Parkit · Mis abonos',
        loadComponent: () => import('./pages/conductor/abonos/abonos').then((m) => m.Abonos),
      },
      {
        path: 'abonos/estacionamiento/:estacionamientoId',
        title: 'Parkit · Abonos del estacionamiento',
        loadComponent: () =>
          import('./pages/conductor/planes-estacionamiento/planes-estacionamiento').then(
            (m) => m.PlanesEstacionamiento,
          ),
      },
      {
        path: 'abonos/:abonoId/reservar',
        title: 'Parkit · Reservar con abono',
        loadComponent: () =>
          import('./pages/conductor/reservar-con-abono/reservar-con-abono').then((m) => m.ReservarConAbono),
      },
```

En `layout-app.ts`, en `NAVEGACION.CONDUCTOR`, después de "Mis reservas":

```ts
    { ruta: '/conductor/abonos', etiqueta: 'Abonos', icono: 'calendario' },
```

En `detalle-estacionamiento.ts`, sumar `RouterLink` (de `@angular/router`) al array `imports` del componente y, dentro del bloque `<!-- Accion -->`, debajo del `<button>` de reservar:

```html
        <a
          class="mt-2 block text-center text-[13px] font-semibold text-acento hover:underline"
          [routerLink]="['/conductor/abonos/estacionamiento', estacionamiento().id]"
        >
          Ver abonos mensuales
        </a>
```

- [ ] **Step 2: Planes del estacionamiento (comprar)**

`Front/src/app/pages/conductor/planes-estacionamiento/planes-estacionamiento.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Id, PlanAbono, TURNOS } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/conductor/abonos/estacionamiento/:estacionamientoId` · rol CONDUCTOR
 *
 * Los planes de abono de un estacionamiento. Comprar uno es pagar por
 * adelantado (simulado) sus usos; despues se reserva gratis en "Mis abonos".
 */
@Component({
  selector: 'app-planes-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink],
  template: `
    <div class="aparece mx-auto w-full max-w-[640px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Abonos mensuales</p>
          <h1 class="titulo-vista mt-1.5">{{ estacionamiento.value()?.nombre ?? 'Estacionamiento' }}</h1>
          <p class="mt-2 text-[13px] text-plomo">
            Pagás ahora una cantidad de usos en un turno y reservás gratis dentro de ese horario
            durante 30 días. El abono no reserva lugar: cada reserva depende de que haya cochera libre.
          </p>
        </header>

        @if (planes.isLoading()) {
          <ui-cargando [cantidad]="2" />
        } @else if (planes.value().length === 0) {
          <ui-estado-vacio titulo="Este estacionamiento no ofrece abonos" descripcion="Podés reservar por hora, estadía o jornada.">
            <ui-boton routerLink="/conductor/explorar">Volver a explorar</ui-boton>
          </ui-estado-vacio>
        } @else {
          @for (plan of planes.value(); track plan.id) {
            <ui-tarjeta>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-[15px] font-semibold text-tinta">
                    Turno {{ turnos[plan.turno].etiqueta.toLowerCase() }}
                    <span class="font-normal text-plomo">· {{ turnos[plan.turno].desde }} a {{ turnos[plan.turno].hasta }}</span>
                  </p>
                  <p class="mt-1 text-[13px] text-plomo">
                    {{ plan.cupos }} usos · $ {{ plan.precio.toLocaleString('es-AR') }} · 30 días
                  </p>
                </div>
                <ui-boton variante="primario" [cargando]="comprandoId() === plan.id" (presionado)="comprar(plan)">
                  Comprar
                </ui-boton>
              </div>
            </ui-tarjeta>
          }
        }

        @if (error(); as mensaje) {
          <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
        }
      </div>
    </div>
  `,
})
export class PlanesEstacionamiento {
  private readonly abonos = inject(AbonoService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  readonly estacionamientoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly comprandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly estacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly planes = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.planes(params),
    defaultValue: [] as PlanAbono[],
  });

  protected comprar(plan: PlanAbono): void {
    this.comprandoId.set(plan.id);
    this.error.set(null);
    this.abonos.comprar(plan.id).subscribe({
      next: () => void this.router.navigate(['/conductor/abonos']),
      error: (e: Error) => {
        this.comprandoId.set(null);
        this.error.set(e.message);
      },
    });
  }
}
```

- [ ] **Step 3: Mis abonos**

`Front/src/app/pages/conductor/abonos/abonos.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Modal, Tarjeta } from '@app/components/ui';
import { Abono, TURNOS } from '@app/models';
import { AbonoService } from '@app/services/abono.service';

/**
 * Pantalla `/conductor/abonos` · rol CONDUCTOR
 *
 * Los abonos comprados con sus usos restantes. Desde aca se reserva con uno
 * (gratis, dentro de su turno) o se lo cancela.
 */
@Component({
  selector: 'app-abonos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Modal, Tarjeta, RouterLink, DatePipe],
  template: `
    <div class="aparece mx-auto w-full max-w-[640px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Conductor</p>
          <h1 class="titulo-vista mt-1.5">Mis abonos</h1>
        </header>

        @if (recurso.isLoading()) {
          <ui-cargando [cantidad]="2" />
        } @else if (recurso.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar tus abonos" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (recurso.value().length === 0) {
          <ui-estado-vacio
            titulo="Todavía no tenés abonos"
            descripcion="Buscá un estacionamiento en el mapa y abrí “Ver abonos mensuales”."
          >
            <ui-boton routerLink="/conductor/explorar">Explorar estacionamientos</ui-boton>
          </ui-estado-vacio>
        } @else {
          @for (abono of recurso.value(); track abono.id) {
            <ui-tarjeta>
              <div class="flex flex-col gap-3">
                <div>
                  <p class="text-[15px] font-semibold text-tinta">{{ abono.estacionamiento }}</p>
                  <p class="mt-1 text-[13px] text-plomo">
                    Turno {{ turnos[abono.turno].etiqueta.toLowerCase() }}
                    ({{ turnos[abono.turno].desde }} a {{ turnos[abono.turno].hasta }}) ·
                    vence el {{ abono.hasta | date: 'd MMM' }}
                  </p>
                  <p class="mt-1 text-[13px] text-tinta">
                    {{ abono.cuposRestantes }} de {{ abono.cuposTotales }} usos disponibles
                    @if (abono.estado !== 'VIGENTE') {
                      <span class="text-plomo">· {{ abono.estado.toLowerCase() }}</span>
                    }
                  </p>
                </div>
                @if (abono.estado === 'VIGENTE') {
                  <div class="flex flex-wrap gap-2">
                    <ui-boton
                      variante="primario"
                      tamano="sm"
                      [deshabilitado]="abono.cuposRestantes === 0"
                      [routerLink]="['/conductor/abonos', abono.id, 'reservar']"
                    >
                      Reservar con este abono
                    </ui-boton>
                    <ui-boton variante="peligro" tamano="sm" (presionado)="aCancelar.set(abono)">
                      Cancelar abono
                    </ui-boton>
                  </div>
                }
              </div>
            </ui-tarjeta>
          }
        }
      </div>
    </div>

    <ui-modal titulo="Cancelar abono" [abierto]="aCancelar() !== null" (cerrado)="aCancelar.set(null)">
      @if (aCancelar(); as abono) {
        <div class="flex flex-col gap-4">
          <p class="text-[13.5px] text-grafito">
            Se cancelan también tus reservas con este abono que todavía no empezaron. El pago no se
            devuelve.
          </p>
          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }
          <ui-boton variante="peligro" [bloque]="true" [cargando]="cancelando()" (presionado)="cancelar(abono)">
            Cancelar abono
          </ui-boton>
        </div>
      }
    </ui-modal>
  `,
})
export class Abonos {
  private readonly abonos = inject(AbonoService);

  protected readonly turnos = TURNOS;
  protected readonly aCancelar = signal<Abono | null>(null);
  protected readonly cancelando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly recurso = rxResource({
    stream: () => this.abonos.misAbonos(),
    defaultValue: [] as Abono[],
  });

  protected cancelar(abono: Abono): void {
    this.cancelando.set(true);
    this.error.set(null);
    this.abonos.cancelar(abono.id).subscribe({
      next: () => {
        this.cancelando.set(false);
        this.aCancelar.set(null);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.cancelando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
```

Si `ui-boton` no reenvía `routerLink` al elemento interno, envolvelo en `<a [routerLink]="…">` como se hace en otras pantallas (ver `estado-vacio` en `mis-reservas.html`, donde `<ui-boton routerLink=…>` ya se usa, así que debería funcionar).

- [ ] **Step 4: Reservar con abono**

`Front/src/app/pages/conductor/reservar-con-abono/reservar-con-abono.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Abono, HoraHHmm, Id, TURNOS, Vehiculo } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { ReservaService } from '@app/services/reserva.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import { aFechaISO } from '@app/utils/fecha.util';

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Pantalla `/conductor/abonos/:abonoId/reservar` · rol CONDUCTOR
 *
 * Reserva gratis con un abono: vehiculo, dia y horario dentro del turno.
 * Descuenta un uso; la cochera la asigna el backend como en cualquier reserva.
 */
@Component({
  selector: 'app-reservar-con-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink],
  template: `
    <div class="aparece mx-auto w-full max-w-[560px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Reservar con abono</p>
          <h1 class="titulo-vista mt-1.5">{{ abono()?.estacionamiento ?? 'Abono' }}</h1>
        </header>

        @if (misAbonos.isLoading() || vehiculos.isLoading()) {
          <ui-cargando [cantidad]="1" />
        } @else if (!abono()) {
          <ui-estado-vacio titulo="No encontramos ese abono">
            <ui-boton routerLink="/conductor/abonos">Ir a mis abonos</ui-boton>
          </ui-estado-vacio>
        } @else if (abono(); as a) {
          <ui-tarjeta>
            <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); confirmar(a, vehiculo.value, fecha.value, desde.value, hasta.value)">
              <p class="text-[13px] text-plomo">
                Turno {{ turnos[a.turno].etiqueta.toLowerCase() }} ({{ turnos[a.turno].desde }} a
                {{ turnos[a.turno].hasta }}) · te quedan {{ a.cuposRestantes }} usos · vale hasta el {{ a.hasta }}
              </p>
              <label class="flex flex-col gap-1 text-[12.5px] text-plomo">
                Vehículo
                <select #vehiculo class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                  @for (v of vehiculos.value(); track v.id) {
                    <option [value]="v.id" [selected]="v.predeterminado">{{ v.patente }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1 text-[12.5px] text-plomo">
                Día
                <input #fecha type="date" required [min]="minimo(a)" [max]="a.hasta" [value]="minimo(a)"
                  class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta" />
              </label>
              <div class="flex gap-3">
                <label class="flex flex-1 flex-col gap-1 text-[12.5px] text-plomo">
                  Desde
                  <select #desde class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                    @for (h of horas(a).inicios; track h) { <option [value]="h">{{ h }}</option> }
                  </select>
                </label>
                <label class="flex flex-1 flex-col gap-1 text-[12.5px] text-plomo">
                  Hasta
                  <select #hasta class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                    @for (h of horas(a).fines; track h) { <option [value]="h">{{ h }}</option> }
                  </select>
                </label>
              </div>
              @if (error(); as mensaje) {
                <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
              }
              <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()">
                Reservar gratis (usa 1 de {{ a.cuposRestantes }})
              </ui-boton>
            </form>
          </ui-tarjeta>
        }
      </div>
    </div>
  `,
})
export class ReservarConAbono {
  private readonly abonos = inject(AbonoService);
  private readonly reservas = inject(ReservaService);
  private readonly vehiculosService = inject(VehiculoService);
  private readonly router = inject(Router);

  readonly abonoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly misAbonos = rxResource({
    stream: () => this.abonos.misAbonos(),
    defaultValue: [] as Abono[],
  });

  protected readonly vehiculos = rxResource({
    stream: () => this.vehiculosService.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  protected readonly abono = computed(() =>
    this.misAbonos.value().find((a) => a.id === this.abonoId() && a.estado === 'VIGENTE') ?? null,
  );

  /** Hoy o el primer dia del abono, lo que venga despues. */
  protected minimo(abono: Abono): string {
    const hoy = aFechaISO(new Date());
    return hoy > abono.desde ? hoy : abono.desde;
  }

  /**
   * Horas en punto dentro del turno. La noche termina a las 24, pero una
   * reserva no puede pasar la medianoche (ni el cierre, como mucho 23:59):
   * el ultimo fin que se ofrece es 23:00.
   */
  protected horas(abono: Abono): { inicios: HoraHHmm[]; fines: HoraHHmm[] } {
    const { desde, hasta } = TURNOS[abono.turno];
    const primera = Number(desde.slice(0, 2));
    const ultima = Math.min(Number(hasta.slice(0, 2)), 23);
    const rango = (de: number, a: number) =>
      Array.from({ length: a - de + 1 }, (_, i) => `${dosDigitos(de + i)}:00`);
    return { inicios: rango(primera, ultima - 1), fines: rango(primera + 1, ultima) };
  }

  protected confirmar(abono: Abono, vehiculoId: string, fecha: string, horaDesde: string, horaHasta: string): void {
    if (horaHasta <= horaDesde) {
      this.error.set('La hora de salida tiene que ser posterior a la de entrada.');
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.reservas
      .crearConAbono({ abonoId: abono.id, vehiculoId, fecha, horaDesde, horaHasta })
      .subscribe({
        next: () => void this.router.navigate(['/conductor/mis-reservas']),
        error: (e: Error) => {
          this.enviando.set(false);
          this.error.set(e.message);
        },
      });
  }
}
```

- [ ] **Step 5: Compilar y correr los tests**

Run: `cd Front && npx ng build --configuration development && npx ng test --watch=false`
Expected: build sin errores y tests PASS.

- [ ] **Step 6: Probar a mano el flujo completo**

Con back y front levantados:
1. Como propietario, ofrecer el turno mañana: 2 usos, $30.000.
2. Como conductor, en el mapa abrir ese estacionamiento → "Ver abonos mensuales" → "Comprar". Te lleva a "Mis abonos" con "2 de 2 usos disponibles".
3. "Reservar con este abono": los horarios ofrecidos van de 06:00 a 12:00. Reservar mañana de 08:00 a 10:00. En "Mis reservas" aparece CONFIRMADA, con "Abono · Turno mañana" en lugar del precio, y con su "Ver QR" (Parte A).
4. "Mis abonos" muestra "1 de 2". Cancelar esa reserva vuelve a "2 de 2".
5. Gastar los dos usos: el botón "Reservar con este abono" queda deshabilitado.
6. "Cancelar abono" pide confirmación y lo deja cancelado, sin botones.
7. Como propietario, la sección "Abonos" lista lo vendido con los usos consumidos.

- [ ] **Step 7: Commit**

```bash
git add Front/src/app/app.routes.ts Front/src/app/layouts/layout-app Front/src/app/components/estacionamiento/detalle-estacionamiento Front/src/app/pages/conductor/abonos Front/src/app/pages/conductor/planes-estacionamiento Front/src/app/pages/conductor/reservar-con-abono
git commit -m "El conductor compra abonos, los ve y reserva gratis con ellos"
```
