# Tarifas por modalidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El propietario define tarifas por hora, estadía (12 h) y jornada (24 h); el conductor las ve y reserva por modalidad, y el precio se guarda en la reserva.

**Architecture:** Tres columnas de tarifa en `estacionamiento` (`NULL` = no se ofrece) y `modalidad` + `precio_total` guardados en `reserva`. Las reglas de duración y precio viven en funciones puras (`Back/src/utils/tarifas.js` y su espejo `Front/src/app/utils/tarifa.util.ts`). El backend valida y calcula; el front solo estima.

**Tech Stack:** Node ≥ 20 + Express + PostgreSQL (`node --test` para pruebas de integración) · Angular (signals, `@angular/build:unit-test` con vitest).

**Spec:** `docs/superpowers/specs/2026-09-23-tarifas-por-modalidad-design.md`

## Global Constraints

- Estadía = **12 h** y jornada = **24 h**, fijas, definidas una sola vez por lado (`HORAS_POR_MODALIDAD`). No configurables.
- Estadía y jornada son **un solo bloque**: `fin - inicio` es exactamente 12 h / 24 h.
- Precios por estacionamiento (no por cochera), `DECIMAL(10,2)`, `>= 0`. `NULL` = modalidad no ofrecida; `0` es un precio válido (gratis).
- Al menos una de las tres tarifas no puede ser `NULL` (API y `CHECK` en la base).
- `PATCH` con `null` borra la modalidad.
- Para estadía/jornada solo se valida que el **ingreso** caiga dentro del horario de atención; HORA sigue validando el rango completo.
- `POST /api/reservas` sin `modalidad` equivale a `HORA` (clientes viejos no se rompen).
- El precio de la reserva se guarda al crearla y nunca se recalcula.
- Código y comentarios en español sin tildes ni eñes en el backend (como el resto del repo); textos de UI con tildes.
- Commits en español, en primera persona ("Agrego…"), **sin `Co-Authored-By`**. Rama: `feat/tarifas-por-modalidad`.
- **Nunca correr `db:migrate` ni `npm test` contra la base de `Back/.env`** (es Neon, en la nube). Usar la base local `parkit_test` (Task 0). Las variables de entorno del shell pisan a las de `--env-file`.

## Review Focus

- Una tarifa en `0` es un precio válido y no significa "no se ofrece" (Task 1 y Task 2).
- Un `PATCH` que dejaría al estacionamiento sin ninguna tarifa devuelve 400, no 500 ni deja la base inconsistente (Task 2).
- Cambiar la tarifa después de reservar no altera el precio de reservas ya hechas (Task 3).
- Una estadía que cruza el cierre o la medianoche es válida si el ingreso está en horario, y devuelve 409 si el ingreso no lo está (Task 3).
- Un cliente que no manda `modalidad` sigue reservando por hora, y por hora sobre un estacionamiento sin `tarifa_hora` devuelve 409 (Task 3).
- Dejar un campo de tarifa vacío en el formulario manda `null`, nunca `0` (Task 4).

---

## File Structure

**Backend**
- Create `Back/src/utils/tarifas.js` — constantes de modalidad, duración fija, `motivoDuracionInvalida`, `precioDeReserva`. Puro.
- Modify `Back/src/utils/horario.js` — agrega `motivoIngresoFueraDeHorario`.
- Modify `Back/src/db/schema.sql` — migración aditiva al final.
- Modify `Back/src/validators/estacionamiento.validator.js`, `Back/src/services/estacionamiento.service.js` — tarifas.
- Modify `Back/src/validators/reserva.validator.js`, `Back/src/services/reserva.service.js` — modalidad, precio guardado.
- Create `Back/pruebas/tarifas.test.mjs` (puras); modify `Back/pruebas/ayuda.mjs`, `estacionamiento.test.mjs`, `reserva.test.mjs` (integración).

**Frontend** (`Front/src/app/`)
- Create `models/tarifa.model.ts`, `utils/tarifa.util.ts` (+ `.spec.ts`), `services/api/api.mapeo.spec.ts`.
- Modify `models/index.ts`, `models/estacionamiento.model.ts`, `models/reserva.model.ts`, `services/api/api.dto.ts`, `services/api/api.mapeo.ts`, `services/estacionamiento.service.ts`, `services/reserva.service.ts`.
- Modify `components/estacionamiento/tarjeta-estacionamiento/*`, `components/estacionamiento/formulario-estacionamiento/*`, `pages/propietario/estacionamientos/*`.
- Modify `pages/conductor/reservar/*`, `components/reserva/resumen-reserva/*`, `components/reserva/fila-reserva/*`.

---

### Task 0: Base local de pruebas (sin commit)

**Files:** ninguno.

- [ ] **Step 1: Confirmar que Postgres local corre y crear la base**

```bash
brew services start postgresql@18
sleep 3
createdb parkit_test 2>&1 || echo "ya existe"
psql parkit_test -c "select version();" | head -3
```
Expected: muestra la versión de PostgreSQL. Si `createdb` falla por conexión, revisar `brew services list`.

- [ ] **Step 2: Migrar el esquema actual a la base local**

```bash
cd Back
export DATABASE_URL=postgresql://localhost:5432/parkit_test DATABASE_SSL=false
npm run db:migrate
```
Expected: `[migrate] schema.sql aplicado`, `[migrate] seed.sql aplicado`, `[migrate] listo`. Si `btree_gist` no está disponible el script sigue igual (avisa con NOTICE).

- [ ] **Step 3: Línea base de pruebas antes de tocar nada**

```bash
npm test
```
Expected: todo en verde. Si algo falla acá, **no seguir**: no es culpa de este plan; avisar al usuario.

> Desde acá, todos los comandos `npm run db:migrate` y `npm test` se corren con las dos variables de `export` de arriba en el mismo shell (`export DATABASE_URL=postgresql://localhost:5432/parkit_test DATABASE_SSL=false`).

---

### Task 1: Lógica pura de tarifas (backend)

**Files:**
- Create: `Back/src/utils/tarifas.js`
- Modify: `Back/src/utils/horario.js` (agregar una función al final)
- Test: `Back/pruebas/tarifas.test.mjs`

**Interfaces:**
- Produces (`tarifas.js`):
  - `MODALIDADES` → `{ HORA: 'HORA', ESTADIA: 'ESTADIA', JORNADA: 'JORNADA' }`
  - `HORAS_POR_MODALIDAD` → `{ ESTADIA: 12, JORNADA: 24 }`
  - `CAMPOS_TARIFA` → `['tarifa_hora', 'tarifa_estadia', 'tarifa_jornada']`
  - `motivoDuracionInvalida(modalidad: string, inicio: Date, fin: Date): string | null`
  - `precioDeReserva(modalidad: string, tarifas: { tarifa_hora, tarifa_estadia, tarifa_jornada }, inicio: Date, fin: Date): number | null` — `null` si la modalidad no se ofrece.
- Produces (`horario.js`): `motivoIngresoFueraDeHorario(horarios: { dia_semana, hora_apertura, hora_cierre }[], inicio: Date): string | null`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `Back/pruebas/tarifas.test.mjs`:

```js
// Tarifas por modalidad: reglas puras de duracion, precio y horario de ingreso.
// No usan la API ni la base.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { instanteLocal, motivoIngresoFueraDeHorario } from '../src/utils/horario.js';
import { motivoDuracionInvalida, precioDeReserva } from '../src/utils/tarifas.js';

const inicio = new Date('2026-09-14T13:00:00Z');
const despues = (horas) => new Date(inicio.getTime() + horas * 3_600_000);

const TARIFAS = { tarifa_hora: 1000, tarifa_estadia: 5000, tarifa_jornada: 8000 };
const SOLO_HORA = { tarifa_hora: 1000, tarifa_estadia: null, tarifa_jornada: null };

describe('motivoDuracionInvalida', () => {
  test('la estadia dura exactamente 12 horas', () => {
    assert.equal(motivoDuracionInvalida('ESTADIA', inicio, despues(12)), null);
    assert.match(motivoDuracionInvalida('ESTADIA', inicio, despues(11)), /12 horas/);
    assert.match(motivoDuracionInvalida('ESTADIA', inicio, despues(24)), /12 horas/);
  });

  test('la jornada dura exactamente 24 horas', () => {
    assert.equal(motivoDuracionInvalida('JORNADA', inicio, despues(24)), null);
    assert.match(motivoDuracionInvalida('JORNADA', inicio, despues(12)), /24 horas/);
    assert.match(motivoDuracionInvalida('JORNADA', inicio, despues(48)), /24 horas/);
  });

  test('por hora no impone una duracion', () => {
    assert.equal(motivoDuracionInvalida('HORA', inicio, despues(3)), null);
  });
});

describe('precioDeReserva', () => {
  test('por hora es proporcional a las horas', () => {
    assert.equal(precioDeReserva('HORA', TARIFAS, inicio, despues(2)), 2000);
    assert.equal(precioDeReserva('HORA', TARIFAS, inicio, despues(1.5)), 1500);
  });

  test('estadia y jornada son de precio fijo', () => {
    assert.equal(precioDeReserva('ESTADIA', TARIFAS, inicio, despues(12)), 5000);
    assert.equal(precioDeReserva('JORNADA', TARIFAS, inicio, despues(24)), 8000);
  });

  test('devuelve null si el estacionamiento no ofrece la modalidad', () => {
    assert.equal(precioDeReserva('ESTADIA', SOLO_HORA, inicio, despues(12)), null);
    assert.equal(precioDeReserva('JORNADA', SOLO_HORA, inicio, despues(24)), null);
    const sinHora = { tarifa_hora: null, tarifa_estadia: 5000, tarifa_jornada: null };
    assert.equal(precioDeReserva('HORA', sinHora, inicio, despues(2)), null);
  });

  test('una tarifa en 0 es un precio (gratis), no "no se ofrece"', () => {
    const gratis = { tarifa_hora: 0, tarifa_estadia: null, tarifa_jornada: null };
    assert.equal(precioDeReserva('HORA', gratis, inicio, despues(2)), 0);
  });
});

describe('motivoIngresoFueraDeHorario', () => {
  // 2026-09-14 es lunes (dia_semana 1).
  const horarios = [{ dia_semana: 1, hora_apertura: '08:00:00', hora_cierre: '20:00:00' }];

  test('un ingreso dentro del horario es valido, aunque el bloque siga despues del cierre', () => {
    assert.equal(motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '18:00')), null);
  });

  test('un ingreso despues del cierre o antes de la apertura no es valido', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '22:00')),
      /fuera del horario/,
    );
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '07:00')),
      /fuera del horario/,
    );
  });

  test('un ingreso justo a la hora de cierre no es valido', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-14', '20:00')),
      /fuera del horario/,
    );
  });

  test('un dia sin horario cargado esta cerrado', () => {
    assert.match(
      motivoIngresoFueraDeHorario(horarios, instanteLocal('2026-09-15', '10:00')),
      /no abre/,
    );
  });

  test('sin horarios cargados no se restringe', () => {
    assert.equal(motivoIngresoFueraDeHorario([], instanteLocal('2026-09-14', '03:00')), null);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd Back && node --test pruebas/tarifas.test.mjs`
Expected: FAIL — `Cannot find module '../src/utils/tarifas.js'`.

- [ ] **Step 3: Implementar `tarifas.js`**

Crear `Back/src/utils/tarifas.js`:

```js
// Modalidades de tarifa y su precio. Funciones puras: sin base ni red.

export const MODALIDADES = Object.freeze({
  HORA: 'HORA',
  ESTADIA: 'ESTADIA',
  JORNADA: 'JORNADA',
});

// Duracion fija (en horas) de las modalidades que se cobran por bloque.
// El front tiene el espejo en Front/src/app/models/tarifa.model.ts.
export const HORAS_POR_MODALIDAD = Object.freeze({ ESTADIA: 12, JORNADA: 24 });

/** Columnas de `estacionamiento` con el precio de cada modalidad (NULL = no la ofrece). */
export const CAMPOS_TARIFA = Object.freeze(['tarifa_hora', 'tarifa_estadia', 'tarifa_jornada']);

const COLUMNA_POR_MODALIDAD = Object.freeze({
  HORA: 'tarifa_hora',
  ESTADIA: 'tarifa_estadia',
  JORNADA: 'tarifa_jornada',
});

const MS_POR_HORA = 3_600_000;

/** Motivo por el que [inicio, fin) no dura lo que exige la modalidad, o null si esta bien. */
export function motivoDuracionInvalida(modalidad, inicio, fin) {
  const horas = HORAS_POR_MODALIDAD[modalidad];
  if (horas === undefined) return null;

  if (fin.getTime() - inicio.getTime() !== horas * MS_POR_HORA) {
    return `la modalidad ${modalidad} dura exactamente ${horas} horas`;
  }
  return null;
}

/**
 * Precio de la reserva segun la modalidad, o null si el estacionamiento no la
 * ofrece. Un 0 es un precio (gratis), no "no se ofrece".
 * Por hora es proporcional (redondeado a centavos); estadia y jornada son fijos.
 */
export function precioDeReserva(modalidad, tarifas, inicio, fin) {
  const tarifa = tarifas[COLUMNA_POR_MODALIDAD[modalidad]];
  if (tarifa === null || tarifa === undefined) return null;

  if (modalidad !== MODALIDADES.HORA) return Number(tarifa);

  const horas = (fin.getTime() - inicio.getTime()) / MS_POR_HORA;
  return Math.round(horas * Number(tarifa) * 100) / 100;
}
```

- [ ] **Step 4: Implementar `motivoIngresoFueraDeHorario`**

Agregar al final de `Back/src/utils/horario.js`:

```js

/**
 * Motivo por el que un ingreso en `inicio` cae fuera del horario de atencion, o
 * null si esta dentro. Lo usan las modalidades por bloque (estadia, jornada):
 * el bloque puede seguir despues del cierre, pero el vehiculo tiene que entrar
 * con el estacionamiento abierto. Sin horarios cargados no se restringe.
 */
export function motivoIngresoFueraDeHorario(horarios, inicio) {
  if (horarios.length === 0) return null;

  const { hora, diaSemana } = partesLocales(inicio);
  const horario = horarios.find((h) => h.dia_semana === diaSemana);
  if (!horario) return 'El estacionamiento no abre ese dia';

  const apertura = horario.hora_apertura.slice(0, 5);
  const cierre = horario.hora_cierre.slice(0, 5);
  if (hora < apertura || hora >= cierre) {
    return `El ingreso esta fuera del horario de atencion (${apertura} a ${cierre})`;
  }

  return null;
}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `cd Back && node --test pruebas/tarifas.test.mjs`
Expected: PASS — 12 pruebas en verde.

- [ ] **Step 6: Commit**

```bash
git add Back/src/utils/tarifas.js Back/src/utils/horario.js Back/pruebas/tarifas.test.mjs
git commit -m "Agrego las reglas puras de tarifas por modalidad"
```

---

### Task 2: Migración y API de estacionamiento con tarifas

**Files:**
- Modify: `Back/src/db/schema.sql` (al final)
- Modify: `Back/src/validators/estacionamiento.validator.js`
- Modify: `Back/src/services/estacionamiento.service.js`
- Modify: `Back/pruebas/ayuda.mjs` (`crearEstacionamiento`)
- Test: `Back/pruebas/estacionamiento.test.mjs`

**Interfaces:**
- Consumes: `CAMPOS_TARIFA` de `../utils/tarifas.js` (Task 1).
- Produces: las respuestas de estacionamiento incluyen `tarifa_hora`, `tarifa_estadia`, `tarifa_jornada` (`number | null`). `crearEstacionamiento(token, { cocheras, tipo, horarios, tarifas })` en `ayuda.mjs`, con `tarifas` por defecto `{ tarifa_hora: 1000 }`.

- [ ] **Step 1: Extender el helper de pruebas**

En `Back/pruebas/ayuda.mjs`, cambiar la firma y el body de `crearEstacionamiento`:

```js
export async function crearEstacionamiento(
  token,
  { cocheras = 1, tipo = 1, horarios, tarifas = { tarifa_hora: 1000 } } = {},
) {
```
y reemplazar la línea `tarifa_hora: 1000,` del body por:
```js
      ...tarifas,
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Agregar al final de `Back/pruebas/estacionamiento.test.mjs`:

```js

describe('tarifas por modalidad', () => {
  const rutaDe = (estacionamiento) => `/estacionamientos/${estacionamiento.id_estacionamiento}`;

  test('se puede ofrecer solo estadia y jornada', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_estadia: 5000, tarifa_jornada: 8000 },
    });

    assert.equal(estacionamiento.tarifa_hora, null);
    assert.equal(estacionamiento.tarifa_estadia, 5000);
    assert.equal(estacionamiento.tarifa_jornada, 8000);
  });

  test('crear sin ninguna tarifa devuelve 400', async () => {
    const propietario = await nuevoPropietario();
    const { estado, datos } = await api('POST', '/estacionamientos', {
      token: propietario.token,
      body: {
        nombre: 'Sin tarifas',
        calle: 'Av. Prueba',
        numero: '1',
        ciudad: 'CABA',
        provincia: 'Buenos Aires',
      },
    });

    assert.equal(estado, 400);
    assert.match(JSON.stringify(datos), /tarifa_hora/);
  });

  test('una tarifa en 0 es valida (gratis)', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 0 },
    });

    assert.equal(estacionamiento.tarifa_hora, 0);
  });

  test('una tarifa negativa devuelve 400', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_jornada: -1 },
    });
    assert.equal(estado, 400);
  });

  test('PATCH con null borra una modalidad y conserva las demas', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 1000, tarifa_estadia: 5000 },
    });

    const { estado, datos } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_estadia: null },
    });

    assert.equal(estado, 200);
    assert.equal(datos.estacionamiento.tarifa_estadia, null);
    assert.equal(datos.estacionamiento.tarifa_hora, 1000);
  });

  test('PATCH que dejaria al estacionamiento sin tarifas devuelve 400 y no cambia nada', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 1000 },
    });

    const { estado } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_hora: null },
    });
    assert.equal(estado, 400);

    const actual = await api('GET', rutaDe(estacionamiento), { token: propietario.token });
    assert.equal(actual.datos.estacionamiento.tarifa_hora, 1000);
  });
});
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `cd Back && npm test -- 2>&1 | tail -40` (con las variables de la base local del Task 0)
Expected: FAIL en las pruebas nuevas de `tarifas por modalidad` (la columna `tarifa_estadia` no existe / el default 0 lo deja pasar). Las viejas siguen en verde.

- [ ] **Step 4: Migración**

Agregar al final de `Back/src/db/schema.sql`:

```sql

-- Tarifas por modalidad: hora, estadia (12 h) y jornada (24 h). Cada una es
-- opcional (NULL = no la ofrece) pero tiene que haber al menos una. El precio
-- de cada reserva se guarda al crearla, para que cambiar la tarifa despues no
-- altere reservas ya hechas.
ALTER TABLE estacionamiento
  ALTER COLUMN tarifa_hora DROP NOT NULL,
  ALTER COLUMN tarifa_hora DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS tarifa_estadia DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS tarifa_jornada DECIMAL(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estacionamiento_alguna_tarifa'
  ) THEN
    ALTER TABLE estacionamiento
      ADD CONSTRAINT estacionamiento_tarifa_estadia_no_negativa
        CHECK (tarifa_estadia IS NULL OR tarifa_estadia >= 0),
      ADD CONSTRAINT estacionamiento_tarifa_jornada_no_negativa
        CHECK (tarifa_jornada IS NULL OR tarifa_jornada >= 0),
      ADD CONSTRAINT estacionamiento_alguna_tarifa
        CHECK (tarifa_hora IS NOT NULL OR tarifa_estadia IS NOT NULL OR tarifa_jornada IS NOT NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidad_reserva') THEN
    CREATE TYPE modalidad_reserva AS ENUM ('HORA', 'ESTADIA', 'JORNADA');
  END IF;
END
$$;

ALTER TABLE reserva
  ADD COLUMN IF NOT EXISTS modalidad    modalidad_reserva NOT NULL DEFAULT 'HORA',
  ADD COLUMN IF NOT EXISTS precio_total DECIMAL(10, 2);

-- Las reservas anteriores eran todas por hora: se les guarda el precio que
-- daba la formula de entonces.
UPDATE reserva r
   SET precio_total = ROUND(EXTRACT(EPOCH FROM (r.fin - r.inicio)) / 3600 * e.tarifa_hora, 2)
  FROM cochera c
  JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
 WHERE c.id_cochera = r.id_cochera
   AND r.precio_total IS NULL;
```

> `precio_total` queda nullable en esta task: el servicio de reservas todavia no lo inserta (lo hace la Task 3, que agrega el `SET NOT NULL`). Si se lo exigiera ahora, crear reservas fallaria hasta la Task 3.

- [ ] **Step 5: Validador**

En `Back/src/validators/estacionamiento.validator.js`:

1. Cambiar los imports y constantes del principio:

```js
import { ESTADOS_COCHERA } from '../utils/roles.js';
import { CAMPOS_TARIFA } from '../utils/tarifas.js';
import { campos } from './helpers.js';

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const vino = (valor) => valor !== undefined && valor !== null && valor !== '';
const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal',
  'barrio_zona', 'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'cubierto', 'publicado', 'horarios',
];
const CAMPOS_BORRABLES = [
  'descripcion', 'codigo_postal', 'barrio_zona', 'latitud', 'longitud',
  'telefono_contacto', 'email_contacto', 'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada',
];
```
(las constantes `CAMPOS_COCHERA_EDITABLES` que siguen quedan igual).

2. En `validarEstacionamiento`, reemplazar la línea de `tarifa_hora`:

```js
    .numero('tarifa_hora', body.tarifa_hora, { requerido: false, min: 0 })
    .numero('tarifa_estadia', body.tarifa_estadia, { requerido: false, min: 0 })
    .numero('tarifa_jornada', body.tarifa_jornada, { requerido: false, min: 0 })
```
y justo después de `const { valores, errores } = validador.resultado();` agregar:

```js

  // Tiene que ofrecer al menos una modalidad; null y vacio cuentan como "no la ofrece".
  if (!CAMPOS_TARIFA.some((campo) => vino(body[campo]))) {
    errores.push({
      campo: 'tarifa_hora',
      mensaje: 'ofrece al menos una tarifa (hora, estadia o jornada)',
    });
  }
```

3. En `validarCambiosEstacionamiento`, reemplazar la línea de `tarifa_hora` por:

```js
    .numero('tarifa_hora', body.tarifa_hora, { requerido: false, min: 0 })
    .numero('tarifa_estadia', body.tarifa_estadia, { requerido: false, min: 0 })
    .numero('tarifa_jornada', body.tarifa_jornada, { requerido: false, min: 0 })
```
(el bucle existente de `CAMPOS_BORRABLES` ya convierte `null` en borrado).

- [ ] **Step 6: Servicio**

En `Back/src/services/estacionamiento.service.js`:

1. Agregar el import y ampliar las listas:

```js
import { CAMPOS_TARIFA } from '../utils/tarifas.js';
```
```js
const COLUMNAS = [
  'id_estacionamiento', 'id_propietario', 'nombre', 'descripcion', 'direccion',
  'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal', 'barrio_zona',
  'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada',
  'cubierto', 'publicado', 'activo',
];

const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal',
  'barrio_zona', 'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'cubierto', 'publicado',
];
```

2. En `crear`, reemplazar el `INSERT` por:

```js
    const { rows } = await client.query(
      `INSERT INTO estacionamiento
         (id_propietario, nombre, descripcion, direccion, calle, numero, ciudad, provincia,
          codigo_postal, barrio_zona, latitud, longitud, telefono_contacto, email_contacto,
          tarifa_hora, tarifa_estadia, tarifa_jornada, cubierto, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING ${CAMPOS}`,
      [
        idPropietario,
        datos.nombre,
        datos.descripcion ?? null,
        datos.direccion,
        datos.calle,
        datos.numero,
        datos.ciudad,
        datos.provincia,
        datos.codigo_postal ?? null,
        datos.barrio_zona ?? null,
        datos.latitud ?? null,
        datos.longitud ?? null,
        datos.telefono_contacto ?? null,
        datos.email_contacto ?? null,
        datos.tarifa_hora ?? null,
        datos.tarifa_estadia ?? null,
        datos.tarifa_jornada ?? null,
        datos.cubierto ?? false,
        datos.publicado ?? false,
      ],
    );
```

3. En `actualizar`, agregar como **primera línea** dentro del callback de `withTransaction` (antes de `const asignaciones = [];`):

```js
    await asegurarAlgunaTarifa(client, idEstacionamiento, datos);
```
y agregar la función justo antes de `actualizar`:

```js
/**
 * Despues de aplicar los cambios el estacionamiento tiene que seguir ofreciendo
 * alguna modalidad. Se toma la fila con FOR UPDATE para que dos PATCH
 * simultaneos no puedan borrar entre los dos todas las tarifas.
 */
async function asegurarAlgunaTarifa(client, idEstacionamiento, datos) {
  const { rows } = await client.query(
    `SELECT ${CAMPOS_TARIFA.join(', ')}
       FROM estacionamiento WHERE id_estacionamiento = $1 FOR UPDATE`,
    [idEstacionamiento],
  );

  const ofreceAlguna = CAMPOS_TARIFA.some((campo) => {
    const resultante = datos[campo] !== undefined ? datos[campo] : rows[0][campo];
    return resultante !== null;
  });

  if (!ofreceAlguna) {
    throw ApiError.badRequest(
      'El estacionamiento tiene que ofrecer al menos una tarifa (hora, estadia o jornada)',
    );
  }
}
```

- [ ] **Step 7: Migrar la base local y correr las pruebas**

```bash
cd Back
export DATABASE_URL=postgresql://localhost:5432/parkit_test DATABASE_SSL=false
npm run db:migrate && npm run db:migrate && npm test
```
Expected: la migración se aplica **dos veces** sin error (idempotente) y todas las pruebas pasan, incluidas las 6 nuevas. La prueba vieja `precio_total 2000` de `reserva.test.mjs` también pasa (todavía usa la fórmula de `SELECT_DETALLE`, y las reservas nuevas quedan con `precio_total` en NULL hasta la Task 3).

- [ ] **Step 8: Commit**

```bash
git add Back/src/db/schema.sql Back/src/validators/estacionamiento.validator.js Back/src/services/estacionamiento.service.js Back/pruebas/ayuda.mjs Back/pruebas/estacionamiento.test.mjs
git commit -m "Permito ofrecer tarifas por hora, estadia y jornada en el estacionamiento"
```

---

### Task 3: Reservas por modalidad con precio guardado (backend)

**Files:**
- Modify: `Back/src/db/schema.sql` (agrega `SET NOT NULL` a `precio_total`)
- Modify: `Back/src/validators/reserva.validator.js`
- Modify: `Back/src/services/reserva.service.js`
- Test: `Back/pruebas/reserva.test.mjs`

**Interfaces:**
- Consumes: `MODALIDADES`, `motivoDuracionInvalida`, `precioDeReserva` (`utils/tarifas.js`); `motivoIngresoFueraDeHorario` (`utils/horario.js`); `crearEstacionamiento(..., { tarifas })` (Task 2).
- Produces: `POST /api/reservas` acepta `modalidad` (`HORA` por defecto) y devuelve la reserva con `modalidad` y `precio_total` guardado. Los listados de reservas devuelven esos dos campos y **ya no** devuelven `tarifa_hora`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `Back/pruebas/reserva.test.mjs`:

1. Cambiar `escenario` para aceptar tarifas:

```js
async function escenario({ cocheras = 1, horarios, tarifas } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, {
    cocheras,
    horarios,
    tarifas,
  });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);

  return { propietario, estacionamiento, conductor, vehiculo };
}
```
(`tarifas` en `undefined` usa el default `{ tarifa_hora: 1000 }` del helper.)

2. Agregar el helper `bloque` justo debajo de `reservar`:

```js
/** Bloque de `horas` horas que arranca manana a `hora` (hora argentina). */
function bloque(horas, hora = '08:00') {
  const dia = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const inicio = `${dia}T${hora}:00-03:00`;
  const fin = new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
  return { inicio, fin };
}
```

3. En la prueba `nace PENDIENTE y con una cochera asignada`, agregar tras el assert del precio:
```js
    assert.equal(datos.reserva.modalidad, 'HORA');
```

4. Agregar al final del archivo:

```js

describe('modalidades de tarifa', () => {
  const TARIFAS = { tarifa_hora: 1000, tarifa_estadia: 5000, tarifa_jornada: 8000 };

  test('estadia: 12 horas a precio fijo', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 201);
    assert.equal(datos.reserva.modalidad, 'ESTADIA');
    assert.equal(datos.reserva.precio_total, 5000);
  });

  test('jornada: 24 horas a precio fijo', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(24),
      modalidad: 'JORNADA',
    });

    assert.equal(estado, 201);
    assert.equal(datos.reserva.modalidad, 'JORNADA');
    assert.equal(datos.reserva.precio_total, 8000);
  });

  test('una estadia que no dura 12 horas devuelve 400', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(11),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 400);
    assert.match(JSON.stringify(datos), /12 horas/);
  });

  test('una jornada que no dura 24 horas devuelve 400', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'JORNADA',
    });

    assert.equal(estado, 400);
  });

  test('una modalidad que el estacionamiento no ofrece devuelve 409', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario(); // solo por hora

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'ESTADIA',
    });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /ESTADIA/);
  });

  test('por hora en un estacionamiento que no la ofrece devuelve 409', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: { tarifa_estadia: 5000 },
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, franja());

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /HORA/);
  });

  test('una estadia puede seguir despues del cierre si el ingreso esta en horario', async () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
      dia_semana,
      hora_apertura: '08:00',
      hora_cierre: '20:00',
    }));
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: TARIFAS,
      horarios,
    });

    const { estado } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12, '18:00'),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 201);
  });

  test('una estadia con el ingreso fuera del horario devuelve 409', async () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
      dia_semana,
      hora_apertura: '08:00',
      hora_cierre: '20:00',
    }));
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: TARIFAS,
      horarios,
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12, '22:00'),
      modalidad: 'ESTADIA',
    });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /fuera del horario/);
  });

  test('el precio queda guardado aunque el propietario cambie la tarifa despues', async () => {
    const { propietario, conductor, estacionamiento, vehiculo } = await escenario();

    const alta = await reservar(conductor, estacionamiento, vehiculo, franja());
    assert.equal(alta.datos.reserva.precio_total, 2000);

    const cambio = await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { tarifa_hora: 3000 },
    });
    assert.equal(cambio.estado, 200);

    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas[0].precio_total, 2000);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd Back && npm test` (variables de la base local)
Expected: FAIL en `modalidades de tarifa` (no existe `modalidad` en la respuesta, no valida duración, etc.). El resto en verde.

- [ ] **Step 3: Validador**

En `Back/src/validators/reserva.validator.js`:

1. Agregar el import al principio:
```js
import { MODALIDADES, motivoDuracionInvalida } from '../utils/tarifas.js';
```
2. Agregar el campo `modalidad` a la cadena, justo después de `.uuid('id_vehiculo', body.id_vehiculo)`:
```js
    .enumerado('modalidad', body.modalidad, Object.values(MODALIDADES), {
      requerido: false,
      default: MODALIDADES.HORA,
    })
```
3. Dentro del `if (valores.inicio && valores.fin) {`, después del bloque que valida `inicio` en el pasado, agregar:
```js
    const motivoDuracion = motivoDuracionInvalida(valores.modalidad, valores.inicio, valores.fin);
    if (motivoDuracion) errores.push({ campo: 'fin', mensaje: motivoDuracion });
```

- [ ] **Step 4: Servicio**

En `Back/src/services/reserva.service.js`:

1. Imports:
```js
import {
  FRANJAS_ESTANDAR,
  instanteLocal,
  motivoFueraDeHorario,
  motivoIngresoFueraDeHorario,
  sumarDias,
} from '../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { CAMPOS_TARIFA, MODALIDADES, precioDeReserva } from '../utils/tarifas.js';
```
(reemplaza los dos imports existentes de `horario.js` y `roles.js`).

2. En `SELECT_DETALLE`, reemplazar estas dos líneas:
```
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion, e.tarifa_hora,
         ROUND(EXTRACT(EPOCH FROM (r.fin - r.inicio)) / 3600 * e.tarifa_hora, 2) AS precio_total,
```
por:
```
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion,
         r.modalidad, r.precio_total,
```
y actualizar el comentario de arriba: `/** Reserva con todo lo que muestran los listados, con la modalidad y el precio guardados al reservar. */`.

3. Reemplazar la firma de `crear` y el tramo desde `await validarHorario(...)` hasta el `INSERT`:

```js
export async function crear(
  idConductor,
  { id_cochera, id_estacionamiento, id_vehiculo, inicio, fin, modalidad = MODALIDADES.HORA },
) {
  return withTransaction(async (client) => {
    const vehiculo = await obtenerVehiculo(client, id_vehiculo, idConductor);
    await asegurarVehiculoLibre(client, id_vehiculo, inicio, fin);

    const cochera = id_cochera
      ? await bloquearCochera(client, id_cochera, vehiculo, inicio, fin)
      : await asignarCochera(client, id_estacionamiento, vehiculo, inicio, fin);

    const precio = await precioDe(client, cochera.id_estacionamiento, modalidad, inicio, fin);
    await validarHorario(client, cochera.id_estacionamiento, inicio, fin, modalidad);

    let idReserva;
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva
           (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, modalidad, precio_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id_reserva`,
        [
          idConductor,
          id_vehiculo,
          cochera.id_cochera,
          inicio,
          fin,
          ESTADOS_RESERVA.PENDIENTE,
          modalidad,
          precio,
        ],
      );
      idReserva = rows[0].id_reserva;
    } catch (error) {
```
(el `catch` y lo que sigue quedan como estaban).

4. Reemplazar `validarHorario` y agregar `precioDe` justo antes:

```js
/** Precio de la reserva segun la tarifa vigente; 409 si el estacionamiento no ofrece la modalidad. */
async function precioDe(client, idEstacionamiento, modalidad, inicio, fin) {
  const { rows } = await client.query(
    `SELECT ${CAMPOS_TARIFA.join(', ')} FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );

  const precio = precioDeReserva(modalidad, rows[0], inicio, fin);
  if (precio === null) {
    throw ApiError.conflict(`El estacionamiento no ofrece la modalidad ${modalidad}`);
  }
  return precio;
}

/**
 * Por hora se valida todo el rango. Estadia y jornada duran 12 y 24 horas, que
 * violarian cualquier horario que no sea corrido: solo se valida el ingreso.
 */
async function validarHorario(client, idEstacionamiento, inicio, fin, modalidad) {
  const { rows: horarios } = await client.query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const motivo =
    modalidad === MODALIDADES.HORA
      ? motivoFueraDeHorario(horarios, inicio, fin)
      : motivoIngresoFueraDeHorario(horarios, inicio);
  if (motivo) throw ApiError.conflict(motivo);
}
```

- [ ] **Step 5: Exigir el precio guardado y correr las pruebas**

Ahora que el servicio siempre inserta `precio_total`, agregar al final de `Back/src/db/schema.sql`:

```sql

-- Desde que el servicio guarda el precio al crear la reserva, siempre esta cargado.
-- El UPDATE de arriba rellena las filas que quedaran en NULL antes de este paso.
ALTER TABLE reserva ALTER COLUMN precio_total SET NOT NULL;
```
Correr `npm run db:migrate` **dos veces** (idempotente) y luego `npm test` (variables de la base local).
Expected: PASS — toda la suite, incluidas las 9 de `modalidades de tarifa` y `tarifas.test.mjs`. Verificar que no queda ninguna referencia a `e.tarifa_hora` en `reserva.service.js`: `grep -n "tarifa_hora" src/services/reserva.service.js` no debe devolver nada.

- [ ] **Step 6: Commit**

```bash
git add Back/src/db/schema.sql Back/src/validators/reserva.validator.js Back/src/services/reserva.service.js Back/pruebas/reserva.test.mjs
git commit -m "Reservo por modalidad y guardo el precio al crear la reserva"
```

---

### Task 4: Front — modelo de tarifas, formulario del propietario y tarjetas

**Files:**
- Create: `Front/src/app/models/tarifa.model.ts`
- Create: `Front/src/app/utils/tarifa.util.ts`, `Front/src/app/utils/tarifa.util.spec.ts`
- Create: `Front/src/app/services/api/api.mapeo.spec.ts`
- Modify: `Front/src/app/models/index.ts`, `models/estacionamiento.model.ts`, `models/reserva.model.ts`
- Modify: `Front/src/app/services/api/api.dto.ts`, `services/api/api.mapeo.ts`, `services/estacionamiento.service.ts`
- Modify: `Front/src/app/components/estacionamiento/tarjeta-estacionamiento/tarjeta-estacionamiento.{ts,html}`
- Modify: `Front/src/app/components/estacionamiento/formulario-estacionamiento/formulario-estacionamiento.{ts,html}`
- Modify: `Front/src/app/pages/propietario/estacionamientos/estacionamientos.{ts,html}`
- Modify: `Front/src/app/pages/conductor/reservar/reservar.ts` (solo para que compile; el flujo completo es la Task 5)

**Interfaces:**
- Produces (`models/tarifa.model.ts`):
  - `type ModalidadReserva = 'HORA' | 'ESTADIA' | 'JORNADA'`
  - `interface Tarifas { hora: number | null; estadia: number | null; jornada: number | null }`
  - `HORAS_POR_MODALIDAD: { readonly ESTADIA: 12; readonly JORNADA: 24 }`
  - `ETIQUETA_MODALIDAD: Record<ModalidadReserva, string>`
- Produces (`utils/tarifa.util.ts`):
  - `modalidadesOfrecidas(tarifas: Tarifas): ModalidadReserva[]` (orden HORA, ESTADIA, JORNADA)
  - `calcularPrecio(modalidad: ModalidadReserva, tarifas: Tarifas, horas: number): number`
  - `resumenTarifas(tarifas: Tarifas): string`
- `Estacionamiento.tarifas: Tarifas` reemplaza a `precioPorHora`; `NuevoEstacionamiento.tarifas: Tarifas` también.
- `Reserva` gana `modalidad: ModalidadReserva` y `fechaHasta: FechaISO`; `ReservaDetallada.estacionamiento` ya no incluye `precioPorHora`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `Front/src/app/utils/tarifa.util.spec.ts`:

```ts
import { Tarifas } from '@app/models';
import { calcularPrecio, modalidadesOfrecidas, resumenTarifas } from './tarifa.util';

const TODAS: Tarifas = { hora: 900, estadia: 5000, jornada: 8000 };
const SOLO_JORNADA: Tarifas = { hora: null, estadia: null, jornada: 8000 };

describe('modalidadesOfrecidas', () => {
  it('lista solo las que tienen tarifa, en orden hora, estadia, jornada', () => {
    expect(modalidadesOfrecidas(TODAS)).toEqual(['HORA', 'ESTADIA', 'JORNADA']);
    expect(modalidadesOfrecidas(SOLO_JORNADA)).toEqual(['JORNADA']);
  });

  it('una tarifa en 0 cuenta como ofrecida', () => {
    expect(modalidadesOfrecidas({ hora: 0, estadia: null, jornada: null })).toEqual(['HORA']);
  });
});

describe('calcularPrecio', () => {
  it('por hora es proporcional a las horas', () => {
    expect(calcularPrecio('HORA', TODAS, 2)).toBe(1800);
  });

  it('estadia y jornada son de precio fijo, sin importar las horas', () => {
    expect(calcularPrecio('ESTADIA', TODAS, 0)).toBe(5000);
    expect(calcularPrecio('JORNADA', TODAS, 0)).toBe(8000);
  });

  it('devuelve 0 si la modalidad no se ofrece', () => {
    expect(calcularPrecio('HORA', SOLO_JORNADA, 2)).toBe(0);
  });
});

describe('resumenTarifas', () => {
  it('junta las modalidades ofrecidas con su duracion', () => {
    expect(resumenTarifas(TODAS)).toBe('$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)');
  });

  it('omite las que no se ofrecen', () => {
    expect(resumenTarifas(SOLO_JORNADA)).toBe('$8.000 jornada (24 h)');
  });
});
```

Crear `Front/src/app/services/api/api.mapeo.spec.ts`:

```ts
import { NuevoEstacionamiento } from '@app/models';
import { aPayloadEstacionamiento } from './api.mapeo';

const BASE: NuevoEstacionamiento = {
  nombre: 'Cochera Centro',
  direccion: {
    calle: 'Av. Belgrano',
    numero: '1240',
    ciudad: 'CABA',
    provincia: 'Buenos Aires',
    codigoPostal: '',
    latitud: null,
    longitud: null,
  },
  tarifas: { hora: null, estadia: 5000, jornada: null },
  publicado: true,
  horarios: [],
};

describe('aPayloadEstacionamiento', () => {
  it('manda null en las tarifas que no se ofrecen, nunca 0', () => {
    const payload = aPayloadEstacionamiento(BASE);

    expect(payload.tarifa_hora).toBeNull();
    expect(payload.tarifa_estadia).toBe(5000);
    expect(payload.tarifa_jornada).toBeNull();
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd Front && npx ng test --watch=false 2>&1 | tail -30`
Expected: FAIL — no existen `tarifa.util` ni `tarifas` en los modelos.

- [ ] **Step 3: Modelo de tarifas**

Crear `Front/src/app/models/tarifa.model.ts`:

```ts
/** Formas de cobrar una reserva. */
export type ModalidadReserva = 'HORA' | 'ESTADIA' | 'JORNADA';

/** Duracion fija de las modalidades por bloque (espejo de Back/src/utils/tarifas.js). */
export const HORAS_POR_MODALIDAD = { ESTADIA: 12, JORNADA: 24 } as const;

export const ETIQUETA_MODALIDAD: Record<ModalidadReserva, string> = {
  HORA: 'Por hora',
  ESTADIA: `Estadía · ${HORAS_POR_MODALIDAD.ESTADIA} h`,
  JORNADA: `Jornada · ${HORAS_POR_MODALIDAD.JORNADA} h`,
};

/** Precio de cada modalidad; `null` = el estacionamiento no la ofrece (0 es gratis). */
export interface Tarifas {
  hora: number | null;
  estadia: number | null;
  jornada: number | null;
}
```

En `Front/src/app/models/index.ts` agregar la línea:
```ts
export * from './tarifa.model';
```

En `models/estacionamiento.model.ts`:
- importar: `import { Tarifas } from './tarifa.model';`
- en `Estacionamiento`, reemplazar `precioPorHora: number;` por `tarifas: Tarifas;`
- en `NuevoEstacionamiento`, reemplazar `precioPorHora: number;` por `tarifas: Tarifas;`

En `models/reserva.model.ts`:
- importar: `import { ModalidadReserva } from './tarifa.model';`
- en `Reserva`, después de `horaHasta: HoraHHmm;` agregar:
```ts
  /** Dia en que termina: distinto de `fecha` cuando la reserva cruza la medianoche. */
  fechaHasta: FechaISO;
  modalidad: ModalidadReserva;
```
- en `ReservaDetallada`, cambiar el `Pick` a `Pick<Estacionamiento, 'id' | 'nombre' | 'direccion'>`.

- [ ] **Step 4: Utilidades de tarifa**

Crear `Front/src/app/utils/tarifa.util.ts`:

```ts
import { HORAS_POR_MODALIDAD, ModalidadReserva, Tarifas } from '@app/models';

const CLAVE: Record<ModalidadReserva, keyof Tarifas> = {
  HORA: 'hora',
  ESTADIA: 'estadia',
  JORNADA: 'jornada',
};

const ORDEN: ModalidadReserva[] = ['HORA', 'ESTADIA', 'JORNADA'];

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/** Las modalidades con tarifa, en el orden en que se muestran. Un 0 cuenta como ofrecida. */
export function modalidadesOfrecidas(tarifas: Tarifas): ModalidadReserva[] {
  return ORDEN.filter((modalidad) => tarifas[CLAVE[modalidad]] !== null);
}

/** Precio estimado (el definitivo lo calcula el backend). `horas` solo cuenta por hora. */
export function calcularPrecio(modalidad: ModalidadReserva, tarifas: Tarifas, horas: number): number {
  const tarifa = tarifas[CLAVE[modalidad]];
  if (tarifa === null) return 0;
  return modalidad === 'HORA' ? Math.round(horas * tarifa) : tarifa;
}

/** "$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)" */
export function resumenTarifas(tarifas: Tarifas): string {
  const partes: string[] = [];
  if (tarifas.hora !== null) partes.push(`${pesos(tarifas.hora)}/h`);
  if (tarifas.estadia !== null) {
    partes.push(`${pesos(tarifas.estadia)} estadía (${HORAS_POR_MODALIDAD.ESTADIA} h)`);
  }
  if (tarifas.jornada !== null) {
    partes.push(`${pesos(tarifas.jornada)} jornada (${HORAS_POR_MODALIDAD.JORNADA} h)`);
  }
  return partes.join(' · ');
}
```

- [ ] **Step 5: DTOs y mapeo**

En `services/api/api.dto.ts`:
- en `EstacionamientoDto` reemplazar `tarifa_hora: number;` por:
```ts
  tarifa_hora: number | null;
  tarifa_estadia: number | null;
  tarifa_jornada: number | null;
```
- en `ReservaDto` **borrar** la línea `tarifa_hora: number;` y agregar tras `precio_total: number;`:
```ts
  modalidad: ModalidadReserva;
```
- cambiar el import del principio a `import { EstadoCochera, ModalidadReserva, RolUsuario } from '@app/models';`

En `services/api/api.mapeo.ts`:
- en `aEstacionamiento`, reemplazar `precioPorHora: dto.tarifa_hora,` por:
```ts
    tarifas: { hora: dto.tarifa_hora, estadia: dto.tarifa_estadia, jornada: dto.tarifa_jornada },
```
- en `aPayloadEstacionamiento`, reemplazar `tarifa_hora: datos.precioPorHora,` por:
```ts
    tarifa_hora: datos.tarifas.hora,
    tarifa_estadia: datos.tarifas.estadia,
    tarifa_jornada: datos.tarifas.jornada,
```
- en `aReserva`, agregar tras `horaHasta: hasta.hora,`:
```ts
    fechaHasta: hasta.fecha,
    modalidad: dto.modalidad,
```
  y **borrar** la línea `precioPorHora: dto.tarifa_hora,` dentro de `estacionamiento: {...}`.

- [ ] **Step 6: Servicio de estacionamientos (orden por precio)**

En `services/estacionamiento.service.ts`, reemplazar el comparador `PRECIO`:

```ts
    PRECIO: (a, b) =>
      (a.tarifas.hora ?? Number.MAX_VALUE) - (b.tarifas.hora ?? Number.MAX_VALUE),
```
(los que no cobran por hora quedan al final.)

- [ ] **Step 7: Tarjeta de estacionamiento**

En `tarjeta-estacionamiento.ts`: importar `resumenTarifas` (`import { resumenTarifas } from '@app/utils/tarifa.util';`) y reemplazar el computed `tarifa` por:

```ts
  /** "$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)" */
  protected readonly tarifas = computed(() => resumenTarifas(this.estacionamiento().tarifas));
```

En `tarjeta-estacionamiento.html`, **borrar** el bloque de la derecha:

```html
      <div class="shrink-0 text-right">
        <p class="num-tabular text-[16px] font-semibold tracking-[-0.01em] text-tinta lg:text-[17px]">
          $ {{ tarifa() }}
        </p>
        <p class="mt-0.5 text-[11px] text-humo">por hora</p>
      </div>
```
y, debajo de `<p class="mt-1 text-[13px] leading-normal text-plomo">{{ ubicacion() }}</p>`, agregar:

```html
          <p class="num-tabular mt-2 text-[12.5px] font-medium text-tinta">{{ tarifas() }}</p>
```

- [ ] **Step 8: Formulario del propietario**

En `formulario-estacionamiento.ts`:

1. Agregar tras `horarioValido`:
```ts
// El estacionamiento tiene que ofrecer al menos una modalidad (vacio = no la ofrece).
function algunaTarifa(grupo: AbstractControl): ValidationErrors | null {
  const { tarifaHora, tarifaEstadia, tarifaJornada } = grupo.value;
  const ofrecida = [tarifaHora, tarifaEstadia, tarifaJornada].some((t) => t !== null && t !== '');
  return ofrecida ? null : { sinTarifa: true };
}
```
2. En `protected readonly formulario = this.fb.nonNullable.group({ ... })`, reemplazar la línea `tarifa: [...]` por:
```ts
    tarifaHora: [null as number | null, [Validators.min(0)]],
    tarifaEstadia: [null as number | null, [Validators.min(0)]],
    tarifaJornada: [null as number | null, [Validators.min(0)]],
```
   y cerrar el grupo con las validaciones cruzadas: el `});` final del `group({...})` pasa a `}, { validators: algunaTarifa });`.
3. En el `patchValue` del `effect`, reemplazar `tarifa: estacionamiento.precioPorHora,` por:
```ts
        tarifaHora: estacionamiento.tarifas.hora,
        tarifaEstadia: estacionamiento.tarifas.estadia,
        tarifaJornada: estacionamiento.tarifas.jornada,
```
4. En `enviar()`, reemplazar `precioPorHora: valores.tarifa ?? 0,` por:
```ts
      tarifas: {
        hora: valores.tarifaHora,
        estadia: valores.tarifaEstadia,
        jornada: valores.tarifaJornada,
      },
```

En `formulario-estacionamiento.html`, reemplazar este bloque exacto:

```html
      <div class="grid grid-cols-2 gap-3">
        <label class="campo">
          <span class="label-campo">Tarifa por hora ($)</span>
          <input class="num-tabular" type="number" min="0" step="50" formControlName="tarifa" placeholder="900" />
          @if (invalido('tarifa')) {
            <span class="campo-error">Ingresá la tarifa.</span>
          }
        </label>

        <label class="flex items-center gap-2.5 self-end pb-3 text-[13px] text-grafito">
          <input class="size-4 shrink-0 accent-acento" type="checkbox" formControlName="cubierto" />
          Es cubierto
        </label>
      </div>
```
por:

```html
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="campo">
          <span class="label-campo">Por hora ($)</span>
          <input class="num-tabular" type="number" min="0" step="50" formControlName="tarifaHora" placeholder="900" />
        </label>
        <label class="campo">
          <span class="label-campo">Estadía · 12 h ($)</span>
          <input class="num-tabular" type="number" min="0" step="50" formControlName="tarifaEstadia" placeholder="5000" />
        </label>
        <label class="campo">
          <span class="label-campo">Jornada · 24 h ($)</span>
          <input class="num-tabular" type="number" min="0" step="50" formControlName="tarifaJornada" placeholder="8000" />
        </label>
      </div>
      <p class="text-[12px] text-plomo">
        Dejá vacía la modalidad que no ofrezcas. Tenés que ofrecer al menos una.
      </p>
      @if (formulario.hasError('sinTarifa') && formulario.touched) {
        <span class="campo-error">Ingresá al menos una tarifa.</span>
      }

      <label class="flex items-center gap-2.5 text-[13px] text-grafito">
        <input class="size-4 shrink-0 accent-acento" type="checkbox" formControlName="cubierto" />
        Es cubierto
      </label>
```

- [ ] **Step 9: Lista del propietario**

En `pages/propietario/estacionamientos/estacionamientos.ts`: importar `resumenTarifas` (`import { resumenTarifas } from '@app/utils/tarifa.util';`) y agregar como campo de la clase:
```ts
  protected readonly resumenTarifas = resumenTarifas;
```
En `estacionamientos.html`, reemplazar:
```html
                $ {{ estacionamiento.precioPorHora.toLocaleString('es-AR') }} por hora
```
por:
```html
                {{ resumenTarifas(estacionamiento.tarifas) }}
```

- [ ] **Step 10: Que `reservar.ts` compile (el flujo real es la Task 5)**

En `pages/conductor/reservar/reservar.ts`:
- importar `resumenTarifas`: `import { resumenTarifas } from '@app/utils/tarifa.util';`
- en `total`, reemplazar `this.reservas.precioEstimado(estacionamiento.precioPorHora)` por `this.reservas.precioEstimado(estacionamiento.tarifas.hora ?? 0)`
- en `contexto`, reemplazar el `const { direccion, precioPorHora, distanciaKm } = estacionamiento;` por `const { direccion, tarifas, distanciaKm } = estacionamiento;` y la línea del `return` por:
```ts
    return `${base}${distancia ? ` · ${distancia}` : ''} · ${resumenTarifas(tarifas)}`;
```

- [ ] **Step 11: Compilar y correr las pruebas**

```bash
cd Front
npx ng test --watch=false 2>&1 | tail -20
npx ng build --configuration development 2>&1 | tail -20
```
Expected: pruebas en verde (las 9 nuevas + las existentes) y el build sin errores de TypeScript ni de plantillas. Si el build reporta otra referencia a `precioPorHora`, buscarla con `grep -rn precioPorHora src` y ajustarla igual que las anteriores.

- [ ] **Step 12: Commit**

```bash
git add Front/src
git commit -m "Muestro y edito las tarifas por modalidad en el front"
```

---

### Task 5: Front — reservar por modalidad

**Files:**
- Modify: `Front/src/app/models/reserva.model.ts`
- Modify: `Front/src/app/services/api/api.mapeo.ts` (`aPayloadReserva`), `services/reserva.service.ts`
- Modify: `Front/src/app/pages/conductor/reservar/reservar.{ts,html}`
- Modify: `Front/src/app/components/reserva/resumen-reserva/resumen-reserva.ts`
- Modify: `Front/src/app/components/reserva/fila-reserva/fila-reserva.{ts,html}`
- Test: `Front/src/app/services/api/api.mapeo.spec.ts`

**Interfaces:**
- Consumes: `ModalidadReserva`, `Tarifas`, `HORAS_POR_MODALIDAD`, `ETIQUETA_MODALIDAD` (`@app/models`); `modalidadesOfrecidas`, `calcularPrecio`, `resumenTarifas` (`@app/utils/tarifa.util`) — Task 4.
- Produces:
  - `NuevaReserva.modalidad: ModalidadReserva` y `NuevaReserva.horaHasta: HoraHHmm | null` (solo se usa en HORA).
  - `BorradorReserva.modalidad: ModalidadReserva` (arranca en `'HORA'`).
  - `ReservaService.precioEstimado(tarifas: Tarifas): number`.
  - `aPayloadReserva(datos)` devuelve `{ id_estacionamiento, id_vehiculo, modalidad, inicio, fin }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar a `Front/src/app/services/api/api.mapeo.spec.ts` (sumar `NuevaReserva` al import de `@app/models` y `aPayloadReserva` al de `./api.mapeo`):

```ts

describe('aPayloadReserva', () => {
  const base = {
    estacionamientoId: 'e1',
    vehiculoId: 'v1',
    fecha: '2026-09-14',
    horaDesde: '08:00',
  };
  const horas = (payload: { inicio: string; fin: string }) =>
    (Date.parse(payload.fin) - Date.parse(payload.inicio)) / 3_600_000;

  it('por hora usa la hora de fin elegida', () => {
    const payload = aPayloadReserva({ ...base, modalidad: 'HORA', horaHasta: '10:00' } as NuevaReserva);

    expect(payload.modalidad).toBe('HORA');
    expect(payload.inicio).toBe('2026-09-14T08:00:00-03:00');
    expect(payload.fin).toBe('2026-09-14T10:00:00-03:00');
  });

  it('la estadia termina 12 horas despues, aunque cruce la medianoche', () => {
    const payload = aPayloadReserva({
      ...base,
      horaDesde: '18:00',
      modalidad: 'ESTADIA',
      horaHasta: null,
    } as NuevaReserva);

    expect(payload.modalidad).toBe('ESTADIA');
    expect(horas(payload)).toBe(12);
  });

  it('la jornada termina 24 horas despues', () => {
    const payload = aPayloadReserva({ ...base, modalidad: 'JORNADA', horaHasta: null } as NuevaReserva);

    expect(payload.modalidad).toBe('JORNADA');
    expect(horas(payload)).toBe(24);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd Front && npx ng test --watch=false 2>&1 | tail -30`
Expected: FAIL — `NuevaReserva` no tiene `modalidad` y `aPayloadReserva` no la manda.

- [ ] **Step 3: Modelo de la reserva**

En `models/reserva.model.ts`:
- Reemplazar `NuevaReserva` por:
```ts
/** Datos que junta el flujo de reserva: vehiculo, modalidad, fecha y hora. */
export interface NuevaReserva {
  estacionamientoId: Id;
  vehiculoId: Id;
  modalidad: ModalidadReserva;
  fecha: FechaISO;
  horaDesde: HoraHHmm;
  /** Solo por hora; estadia y jornada terminan solas (12 h / 24 h despues). */
  horaHasta: HoraHHmm | null;
}
```
- En `BorradorReserva` agregar `modalidad: ModalidadReserva;` tras `vehiculoId`, y en `BORRADOR_VACIO` agregar `modalidad: 'HORA',` en la misma posición.

- [ ] **Step 4: Mapeo del payload**

En `services/api/api.mapeo.ts`:
- agregar `HORAS_POR_MODALIDAD` y `FechaHoraISO` al import de `@app/models` (`FechaHoraISO` sale de `api.model`, que `@app/models` reexporta).
- Reemplazar `aPayloadReserva` por:

```ts
/** El backend asigna la cochera: se reserva por estacionamiento. */
export function aPayloadReserva(datos: NuevaReserva) {
  const inicio = aInstante(datos.fecha, datos.horaDesde);
  return {
    id_estacionamiento: datos.estacionamientoId,
    id_vehiculo: datos.vehiculoId,
    modalidad: datos.modalidad,
    inicio,
    fin: finDeReserva(datos, inicio),
  };
}

/** Por hora el fin lo elige el conductor; estadia y jornada duran un bloque fijo desde el ingreso. */
function finDeReserva(datos: NuevaReserva, inicio: FechaHoraISO): FechaHoraISO {
  if (datos.modalidad === 'HORA') return aInstante(datos.fecha, datos.horaHasta ?? datos.horaDesde);
  const horas = HORAS_POR_MODALIDAD[datos.modalidad];
  return new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
}
```

- [ ] **Step 5: Servicio de reservas**

En `services/reserva.service.ts`:
- imports: agregar `Tarifas` a `@app/models` y `import { HORAS_POR_MODALIDAD } from '@app/models';` (mismo import) y `import { calcularPrecio } from '@app/utils/tarifa.util';`
- Reemplazar `duracionHoras` y `borradorCompleto`:

```ts
  /** Horas del borrador: las elegidas por hora, o el bloque fijo de estadia / jornada. */
  readonly duracionHoras = computed(() => {
    const { modalidad, horaDesde, horaHasta } = this.borradorInterno();
    if (modalidad !== 'HORA') return HORAS_POR_MODALIDAD[modalidad];
    return horaDesde && horaHasta ? duracionEnHoras(horaDesde, horaHasta) : 0;
  });

  readonly borradorCompleto = computed(() => {
    const b = this.borradorInterno();
    const tieneHorario = b.modalidad === 'HORA' ? Boolean(b.horaDesde && b.horaHasta) : Boolean(b.horaDesde);
    return Boolean(b.estacionamientoId && b.vehiculoId && b.fecha && tieneHorario);
  });
```
- Reemplazar `aPayload`:

```ts
  aPayload(): NuevaReserva | null {
    const b = this.borradorInterno();
    if (!this.borradorCompleto() || !b.estacionamientoId || !b.vehiculoId || !b.fecha || !b.horaDesde) {
      return null;
    }
    return {
      estacionamientoId: b.estacionamientoId,
      vehiculoId: b.vehiculoId,
      modalidad: b.modalidad,
      fecha: b.fecha,
      horaDesde: b.horaDesde,
      horaHasta: b.modalidad === 'HORA' ? b.horaHasta : null,
    };
  }
```
- Reemplazar `precioEstimado` (al final de la clase):

```ts
  /** Precio estimado del borrador segun las tarifas del estacionamiento (el definitivo lo calcula el backend). */
  precioEstimado(tarifas: Tarifas): number {
    return calcularPrecio(this.borradorInterno().modalidad, tarifas, this.duracionHoras());
  }
```

- [ ] **Step 6: Resumen de la reserva**

En `components/reserva/resumen-reserva/resumen-reserva.ts`:
- importar `ModalidadReserva`: `import { HoraHHmm, ModalidadReserva } from '@app/models';`
- agregar el input: `readonly modalidad = input<ModalidadReserva>('HORA');`
- reemplazar el computed `duracion`:

```ts
  /** "3 h · 10:00 – 13:00", o "12 h desde las 18:00" en estadia y jornada. */
  protected readonly duracion = computed(() => {
    const desde = this.horaDesde();
    if (this.modalidad() !== 'HORA') {
      return desde ? `${this.horas()} h desde las ${desde}` : 'Elegí la hora de ingreso';
    }
    const hasta = this.horaHasta();
    if (!desde || !hasta) return 'Elegi una franja';
    return `${this.horas()} h · ${desde} – ${hasta}`;
  });
```

- [ ] **Step 7: Pantalla de reserva (lógica)**

En `pages/conductor/reservar/reservar.ts`:

1. Imports: agregar `Chip` a `@app/components/ui` (`import { Boton, Cargando, Chip, EstadoVacio, Tarjeta } from '@app/components/ui';`), `ETIQUETA_MODALIDAD` y `ModalidadReserva` a `@app/models`, y `modalidadesOfrecidas` a `@app/utils/tarifa.util` (`import { modalidadesOfrecidas, resumenTarifas } from '@app/utils/tarifa.util';`). Agregar `Chip` al array `imports` del `@Component`.
2. Campos nuevos, junto a los otros `protected readonly`:

```ts
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;

  /** Solo las modalidades para las que el propietario cargo tarifa. */
  protected readonly modalidades = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    return estacionamiento ? modalidadesOfrecidas(estacionamiento.tarifas) : [];
  });
```
   (debe declararse **después** de `recursoEstacionamiento`.)
3. En `recursoDisponibilidad.params`, las franjas solo aplican por hora:

```ts
    params: () => {
      const { fecha, modalidad } = this.borrador();
      const tipoVehiculo = this.vehiculoElegido()?.tipo;
      return modalidad === 'HORA' && fecha && tipoVehiculo
        ? { estacionamientoId: this.estacionamientoId(), fecha, tipoVehiculo }
        : undefined;
    },
```
4. Reemplazar `total`:
```ts
  protected readonly total = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    return estacionamiento ? this.reservas.precioEstimado(estacionamiento.tarifas) : 0;
  });
```
   Y en `contexto`, dejar como quedó en la Task 4 (usa `resumenTarifas`).
5. En el `constructor`, el effect de "primera franja libre" solo corre por hora; reemplazar su primera línea de guarda:
```ts
      if (franjas.length === 0 || this.borrador().horaDesde || this.borrador().modalidad !== 'HORA') return;
```
   y agregar este effect nuevo al final del constructor:

```ts
    // Si la modalidad elegida no la ofrece este estacionamiento, se pasa a la primera que si.
    effect(() => {
      const ofrecidas = this.modalidades();
      if (ofrecidas.length > 0 && !ofrecidas.includes(this.borrador().modalidad)) {
        this.reservas.actualizarBorrador({ modalidad: ofrecidas[0], horaDesde: null, horaHasta: null });
      }
    });
```
6. Métodos nuevos, junto a `elegirFecha`:

```ts
  protected elegirModalidad(modalidad: ModalidadReserva): void {
    this.reservas.actualizarBorrador({ modalidad, horaDesde: null, horaHasta: null });
  }

  /** Estadia y jornada: el conductor elige solo la hora de ingreso. */
  protected elegirIngreso(evento: Event): void {
    const hora = (evento.target as HTMLInputElement).value;
    this.reservas.actualizarBorrador({ horaDesde: hora || null, horaHasta: null });
  }
```

- [ ] **Step 8: Pantalla de reserva (plantilla)**

En `pages/conductor/reservar/reservar.html`:

1. Insertar, **antes** del bloque `<div class="flex flex-col gap-3">` que contiene `<p class="label-campo">Fecha</p>`:

```html
              @if (modalidades().length > 1) {
                <div class="flex flex-col gap-3">
                  <p class="label-campo">Modalidad</p>
                  <div class="flex flex-wrap gap-2">
                    @for (modalidad of modalidades(); track modalidad) {
                      <ui-chip
                        [activo]="borrador().modalidad === modalidad"
                        (alternar)="elegirModalidad(modalidad)"
                      >
                        {{ etiquetaModalidad[modalidad] }}
                      </ui-chip>
                    }
                  </div>
                </div>
              }

```
2. Reemplazar el bloque de "Franja horaria" (el `<div class="flex flex-col gap-3">` que contiene `<p class="label-campo">Franja horaria</p>`) por:

```html
              @if (borrador().modalidad === 'HORA') {
                <div class="flex flex-col gap-3">
                  <p class="label-campo">Franja horaria</p>
                  @if (recursoDisponibilidad.isLoading()) {
                    <ui-cargando [cantidad]="1" />
                  } @else {
                    <app-selector-franja
                      [franjas]="recursoDisponibilidad.value()"
                      [horaDesde]="borrador().horaDesde"
                      (rangoElegido)="elegirRango($event)"
                    />
                  }
                </div>
              } @else {
                <div class="flex flex-col gap-3">
                  <label class="campo">
                    <span class="label-campo">Hora de ingreso</span>
                    <input
                      class="num-tabular"
                      type="time"
                      [value]="borrador().horaDesde ?? ''"
                      (change)="elegirIngreso($event)"
                    />
                  </label>
                  <p class="text-[12px] text-plomo">
                    La reserva dura {{ horas() }} horas desde el ingreso.
                  </p>
                </div>
              }
```
3. En el `<app-resumen-reserva ...>` agregar el input `[modalidad]="borrador().modalidad"`.
4. En la pantalla de confirmación, reemplazar el párrafo que dice `Guardamos tu lugar el ... a {{ reserva.horaHasta }}` — el trozo:
```html
                >{{ reserva.horaDesde }} a {{ reserva.horaHasta }}</span
              >.
```
por:
```html
                >{{ reserva.horaDesde }} a {{ reserva.horaHasta }}</span
              >{{ reserva.fechaHasta !== reserva.fecha ? ' del día siguiente' : '' }}.
```

- [ ] **Step 9: Filas de reservas**

En `components/reserva/fila-reserva/fila-reserva.ts`: agregar `ETIQUETA_MODALIDAD` al import de `@app/models` y el campo:
```ts
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
```
En `fila-reserva.html`, reemplazar:
```html
      {{ reserva().horaDesde }} – {{ reserva().horaHasta }}
```
por:
```html
      {{ reserva().horaDesde }} – {{ reserva().horaHasta }}
      @if (reserva().fechaHasta !== reserva().fecha) {
        (día siguiente)
      }
      @if (reserva().modalidad !== 'HORA') {
        · {{ etiquetaModalidad[reserva().modalidad] }}
      }
```

- [ ] **Step 10: Compilar y correr las pruebas**

```bash
cd Front
npx ng test --watch=false 2>&1 | tail -20
npx ng build --configuration development 2>&1 | tail -20
```
Expected: pruebas en verde (incluidas las 3 nuevas de `aPayloadReserva`) y build sin errores. Un error típico es olvidar `Chip` en el array `imports` del componente `Reservar`: el build lo marca como `'ui-chip' is not a known element`.

- [ ] **Step 11: Commit**

```bash
git add Front/src
git commit -m "Dejo elegir hora, estadia o jornada al reservar"
```

---

### Task 6: Verificación final

**Files:** ninguno (no se modifica código salvo que algo falle).

- [ ] **Step 1: Suite completa del backend contra la base local**

```bash
cd Back
export DATABASE_URL=postgresql://localhost:5432/parkit_test DATABASE_SSL=false
npm run db:migrate && npm test
```
Expected: migración aplicada sin error y **todas** las pruebas en verde.

- [ ] **Step 2: Front completo**

```bash
cd Front
npx ng test --watch=false 2>&1 | tail -15
npx ng build 2>&1 | tail -15
```
Expected: pruebas en verde y build de producción sin errores.

- [ ] **Step 3: Búsqueda de restos**

```bash
cd ..
grep -rn "precioPorHora" Front/src ; grep -rn "e.tarifa_hora\|tarifa_hora ??" Back/src
```
Expected: sin resultados (la búsqueda `tarifa_max` de `buscar()` usa `e.tarifa_hora <=` a propósito: es la Feature 2 la que la ajusta; si aparece solo esa línea, está bien).

- [ ] **Step 4: Prueba manual en la app real (contra la base local)**

Levantar el backend (`cd Back && npm run dev`, con las dos variables exportadas) y el front (`cd Front && npm start`; `proxy.conf.json` apunta al puerto del backend — verificar que coincida con `PORT` de `Back/.env`). Con dos usuarios (propietario y conductor):
1. Propietario: crear estacionamiento con hora $900, estadía $5000 y jornada $8000; agregar una cochera. Verificar que con los tres campos vacíos el formulario no deja guardar ("Ingresá al menos una tarifa").
2. Conductor: en Explorar la tarjeta muestra `$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)`.
3. Conductor: reservar **por hora**, luego **estadía** (hora de ingreso 18:00) y **jornada**; el resumen muestra "12 h desde las 18:00" y el total fijo. En Mis reservas las de estadía/jornada muestran su modalidad y "(día siguiente)".
4. Propietario: editar y dejar solo jornada; el conductor ya no ve el chip de modalidad si queda una sola, y Mis reservas conserva los precios de antes.

Anotar cualquier diferencia; si algo no anda, corregirlo en la tarea correspondiente y volver a correr los pasos 1–2.

- [ ] **Step 5: Estado de la rama**

```bash
git status -sb && git log --oneline -8
```
Expected: árbol limpio; commits de las Tasks 1–5 sobre `feat/tarifas-por-modalidad`. La integración de la rama (y el pedido de despliegue: en Railway `db:migrate:prod` corre la migración al arrancar) se decide después, con `superpowers:finishing-a-development-branch`.
