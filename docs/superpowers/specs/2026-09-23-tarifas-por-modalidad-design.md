# Tarifas por modalidad (hora, estadía, jornada)

Rama: `feat/tarifas-por-modalidad`, apilada sobre `feat/wip-sesion-fotos-lotes`.
Feature siguiente: `feat/buscar-y-filtrar` (spec propio), apilada sobre esta.

## Objetivo

El propietario define, por estacionamiento, con qué modalidades cobra y el
precio de cada una. El conductor las ve al explorar y al reservar, y el precio
de la reserva se calcula y se guarda según la modalidad elegida.

Se dijo explícitamente: **estadía = 12 h** y **jornada = 24 h**.

## Decisiones

- Tres columnas en `estacionamiento`: `tarifa_hora` (existente), `tarifa_estadia`
  y `tarifa_jornada`. `NULL` significa que la modalidad no se ofrece.
- Los precios son por estacionamiento, no por cochera.
- Duraciones fijas, constantes en el código (`ESTADIA_HORAS = 12`,
  `JORNADA_HORAS = 24`). No las configura el propietario.
- Estadía y jornada son **un solo bloque**. Para más tiempo se reserva de nuevo.
- El precio se guarda en la reserva al crearla, para que un cambio posterior de
  tarifa no altere reservas ya hechas.

## Modelo de datos (`Back/src/db/schema.sql`, idempotente)

- `estacionamiento.tarifa_hora`: pasa a nullable y pierde `DEFAULT 0`.
- `estacionamiento.tarifa_estadia`, `tarifa_jornada`: `DECIMAL(10,2)`, `>= 0`, nullable.
- `CHECK` en `estacionamiento`: al menos una de las tres tarifas no es nula.
- Enum `modalidad_reserva` (`HORA`, `ESTADIA`, `JORNADA`).
- `reserva.modalidad`: `modalidad_reserva NOT NULL DEFAULT 'HORA'`.
- `reserva.precio_total`: `DECIMAL(10,2)`. Las filas existentes se rellenan con
  `ROUND(horas * tarifa_hora, 2)` (fórmula actual) y luego pasa a `NOT NULL`.
- Migración solo aditiva. Un `tarifa_hora = 0` existente sigue siendo un precio válido.

## Backend

### Estacionamiento
- `estacionamiento.validator.js`: `tarifa_hora`, `tarifa_estadia`, `tarifa_jornada`
  opcionales (`>= 0`). Al crear debe venir al menos una; error 400 sobre
  `tarifa_hora` con "ofrecé al menos una tarifa". En `PATCH`, `null` borra una
  modalidad (se agregan a `CAMPOS_BORRABLES`) y el servicio verifica que el
  resultado final conserve al menos una.
- `estacionamiento.service.js`: `COLUMNAS`, `CAMPOS_EDITABLES` e `INSERT` incluyen
  las nuevas columnas; el default `?? 0` de `tarifa_hora` desaparece.

### Reserva
- `reserva.validator.js`: `modalidad` opcional, enumerada, por defecto `HORA`.
- Cálculo de precio en una función pura (`Back/src/utils/tarifas.js`):
  - HORA: `horas * tarifa_hora`, redondeado a 2 decimales (igual que hoy).
  - ESTADIA: `fin - inicio` debe ser exactamente 12 h; precio `tarifa_estadia`.
  - JORNADA: `fin - inicio` debe ser exactamente 24 h; precio `tarifa_jornada`.
- `reserva.service.js`, `crear`: resuelve el estacionamiento de la cochera, valida
  que ofrezca la modalidad, calcula el precio y lo inserta junto con `modalidad`.
  `SELECT_DETALLE` devuelve `modalidad` y `precio_total` guardados (ya no recalcula).
- Horario de atención: para ESTADIA y JORNADA se valida solo que el **ingreso**
  (`inicio`) caiga dentro del horario. El rango completo no se valida, porque un
  bloque de 12 o 24 h violaría cualquier horario no corrido. HORA sigue validando todo el rango.

### Errores
- 400: sin ninguna tarifa; `fin` distinto de `inicio + 12 h` / `inicio + 24 h`.
- 409: el estacionamiento no ofrece la modalidad pedida.
- Sin cambios: 409 de cochera ocupada o vehículo superpuesto.

## Frontend

- Modelo `Estacionamiento`: `precioPorHora` se reemplaza por
  `tarifas: { hora: number | null; estadia: number | null; jornada: number | null }`.
  Se actualizan `api.dto.ts`, `api.mapeo.ts`, `NuevoEstacionamiento`, tarjeta,
  tablero del propietario y `estacionamientos.html`.
- `Reserva`: agrega `modalidad` y `precioTotal` (el guardado).
- Formulario del propietario: tres campos de precio opcionales; validación de que
  haya al menos uno.
- Tarjeta en Explorar: muestra las modalidades ofrecidas con su duración, p. ej.
  `$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)`.
- Reservar: selector de modalidad con solo las ofrecidas.
  - Hora: comportamiento actual.
  - Estadía/jornada: el conductor elige fecha y hora de ingreso; el fin se calcula solo.
  - Función pura de precio estimado por modalidad (misma regla que el backend).
  - Sin endpoint nuevo de disponibilidad: si no hay cochera libre todo el rango,
    el 409 se muestra con el mecanismo actual.
- Mis reservas y el resumen muestran la modalidad y el precio guardado.

## Tests

- Backend (`Back/pruebas/*.test.mjs`, `node --test`): función de precio por
  modalidad; validación de estacionamiento (mínimo una tarifa, `null` borra);
  reserva con modalidad no ofrecida (409) y duración incorrecta (400).
- Frontend: spec de la función pura de precio estimado.

## Fuera de alcance

- Búsqueda y filtros (Feature 2, spec propio).
- Tarifas por cochera o por tipo de vehículo.
- Bloques múltiples de estadía/jornada.
- Endpoint de disponibilidad por modalidad.
