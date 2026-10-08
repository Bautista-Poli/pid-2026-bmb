# Ingreso/egreso por código o QR y abonos mensuales

Rama: `feat/ingreso-codigo-y-abonos`, sobre `development`.

Cubre dos puntos de la entrega que se diseñan juntos porque el segundo depende
del primero:

1. "Registrar ingreso y egreso mediante código o QR, o mediante una acción
   simulada del operador."
2. "Incorporar abonos mensuales con cupo o franjas autorizadas."

Se implementan en ese orden (Parte A y Parte B), cada una con su plan.

## Supuestos pendientes de confirmar con los profesores

- **El código/QR es por estacionamiento**, no por cochera. El sistema no hace
  hincapié en la cochera puntual: el conductor no la elige, se la asigna el
  sistema, y si se bloquea se lo reasigna a otra (`cochera.service.js: bloquear`).
- **El abono intenta mantener una cochera fija**, pero puede cambiar de cochera
  algún día si hace falta (ver Parte B).

Si la respuesta es "por cochera", cambia solo dónde vive el código y la búsqueda
de la reserva (A.2). El resto del diseño se mantiene.

---

## Parte A: ingreso y egreso por código o QR

### Objetivo

El conductor, al llegar al estacionamiento, escanea el QR pegado en la entrada
(o tipea el código que figura debajo) y con eso registra su ingreso. Al irse,
el mismo QR registra el egreso. Los botones del propietario que ya existen
("Registrar ingreso" / "Registrar egreso") quedan como la **acción simulada del
operador**.

### A.1 Modelo de datos (`Back/src/db/schema.sql`, idempotente)

- `estacionamiento.codigo_acceso VARCHAR(6)`, `UNIQUE`.
- Alfabeto sin caracteres ambiguos: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31
  símbolos, sin `0 O 1 I L`). Unas 887 millones de combinaciones.
- Se genera en `estacionamiento.service.js: crear`. Las filas existentes se
  rellenan en la migración con una función SQL que reintenta ante colisión.
  Después, `NOT NULL`.
- Se muestra partido como `K7M-2QX`. Al validar se ignoran guiones, espacios
  y mayúsculas/minúsculas.

### A.2 Backend

**Refactor de `reserva.service.js`.** Hoy `registrarIngreso` y
`registrarEgreso` buscan la reserva con `bloquearReservaDelPropietario`. Se
separan las reglas en dos funciones internas que reciben una reserva ya
bloqueada:

- `aplicarIngreso(client, reserva)`: las validaciones actuales (no PENDIENTE,
  sin ingreso previo, `MARGEN_INGRESO_MS`, franja no terminada), luego
  `ingreso_real = now()` y CONFIRMADA → ACTIVA.
- `aplicarEgreso(client, reserva)`: las validaciones actuales, luego
  `egreso_real = now()` y ACTIVA → FINALIZADA.

Las dos entradas las usan:

- Propietario (sin cambios de contrato): `PATCH /reservas/:id/ingreso|egreso`.
- Conductor (nuevo): por código.

**Resolución de la reserva por código** (`resolverAcceso(client, idConductor, codigo)`):

1. Normaliza el código y busca el estacionamiento activo con ese
   `codigo_acceso`. Si no lo encuentra: 404 "El código no corresponde a ningún
   estacionamiento".
2. Busca las reservas del conductor en cocheras de ese estacionamiento, en este
   orden de prioridad:
   - ACTIVA → acción `EGRESO`.
   - CONFIRMADA con `now()` entre `inicio - MARGEN_INGRESO_MS` y `fin` →
     acción `INGRESO`.
3. Si no encuentra ninguna, el mensaje explica el motivo:
   - Hay una PENDIENTE en la ventana: 409 "Tu reserva todavía no fue
     confirmada por el estacionamiento".
   - Hay una CONFIRMADA más adelante: 409 "Tu reserva empieza a las HH:MM;
     podés ingresar desde las HH:MM".
   - Ninguna: 404 "No tenés una reserva vigente en este estacionamiento".
4. Si hay más de una candidata (dos vehículos con reserva a la vez), se
   devuelven todas y el conductor elige.

**Endpoints nuevos** (`reserva.routes.js`, solo `CONDUCTOR`):

- `GET /reservas/acceso/:codigo`: vista previa sin efectos. Devuelve el
  estacionamiento, las candidatas (reserva + cochera + vehículo) y la acción
  que corresponde a cada una. Alimenta la pantalla de confirmación.
- `POST /reservas/acceso` con `{ codigo, id_reserva? }`: aplica la acción
  dentro de una transacción. Bloquea la reserva (`FOR UPDATE`), vuelve a
  resolver la acción (puede haber cambiado desde la vista previa) y llama a
  `aplicarIngreso` o `aplicarEgreso`. `id_reserva` es obligatorio solo si hay
  más de una candidata. Responde `{ accion, reserva }`.

**Endpoint del propietario:**

- `POST /estacionamientos/:id/codigo-acceso/regenerar` (`PROPIETARIO`, dueño):
  genera un código nuevo e invalida el anterior.
- `codigo_acceso` se agrega a `COLUMNAS` solo en las respuestas para el
  propietario (`/mios`, `/:id` si es el dueño). **No** va en la búsqueda
  pública: si estuviera ahí, cualquiera podría registrar su ingreso desde la
  casa.

**Validación:** `reserva.validator.js` agrega el esquema de `{ codigo, id_reserva? }`.

### A.3 Frontend

**Propietario**, en la edición del estacionamiento (o en el listado):

- Una sección "QR de acceso" con el QR, el código `K7M-2QX` y los botones
  "Imprimir" (hoja A4 con el nombre del estacionamiento, el QR grande, el
  código e instrucciones) y "Regenerar código" (con confirmación).
- El QR codifica `https://<origen del front>/conductor/acceso/K7M2QX`.
- Se genera con la librería `qrcode` (npm) del lado del cliente.

**Conductor:**

- Ruta nueva `/conductor/acceso/:codigo` (dentro de la rama `conductor`, con
  `authGuard` + `rolGuard`). Si no hay sesión, `authGuard` ya manda a
  `/ingresar?redirigir=...` y vuelve después del login.
- La pantalla llama a la vista previa y muestra, por ejemplo, "Estacionamiento
  Centro · Cochera A-12 · 14:00–16:00 · ABC123" con el botón "Registrar
  ingreso" (o "Registrar egreso"). Si hay varias candidatas, muestra una
  tarjeta por cada una. Los errores aparecen en lenguaje claro, con un enlace
  a "Mis reservas".
- Al confirmar, muestra el resultado ("Ingreso registrado 14:03") y lleva a
  "Mis reservas".
- En "Mis reservas", las tarjetas CONFIRMADA (en ventana) y ACTIVA tienen el
  botón "Registrar con código". Abre un campo para tipear el código y navega
  a `/conductor/acceso/:codigo`.
- **No hace falta un lector de QR dentro de la app**: la cámara del celular
  abre la URL directamente.

### A.4 Limitación conocida

El QR es fijo, así que una foto del cartel permite registrar el ingreso desde
otro lugar. Para el TP se acepta. Mitigaciones posibles fuera de alcance:
validar la geolocalización (radio de unos 200 m) o un código rotativo en la
pantalla del encargado.

### A.5 Pruebas (`Back/pruebas/reserva.test.mjs`)

- Ingreso por código en la ventana: la reserva pasa a ACTIVA y la cochera a
  OCUPADA.
- Egreso por código: la reserva pasa a FINALIZADA y la cochera a LIBRE.
- El código se acepta en minúsculas y con guion.
- Código inexistente: 404.
- Código válido pero de otro estacionamiento que aquel donde el conductor
  tiene la reserva: 404 "no tenés una reserva vigente".
- Reserva PENDIENTE: 409.
- Demasiado temprano: 409 con la hora desde la que puede ingresar.
- Dos candidatas sin `id_reserva`: 409 con la lista de candidatas. Con
  `id_reserva`, aplica sobre esa.
- Al regenerar el código, el anterior deja de funcionar.
- Un propietario que no es el dueño no puede regenerar: 403/404, siguiendo lo
  que haga `asegurarPropiedad`.
- Los endpoints del propietario `PATCH /:id/ingreso|egreso` siguen pasando
  sus pruebas actuales sin cambios.

---

## Parte B: abonos mensuales

### Objetivo

El conductor paga por adelantado (de forma simulada) un mes de uso en un
estacionamiento, dentro de unas franjas autorizadas que elige él, sin cubrir
necesariamente todo el horario de atención. Por ejemplo, si el estacionamiento
abre de 10 a 22, el abono puede ser solo los miércoles de 10 a 13, o de lunes
a viernes de 8 a 18 en otro que abra antes. No reserva día por día. Llega,
escanea el QR (Parte A) y entra si está dentro de su franja.

### B.1 Decisión central: el abono genera reservas diarias

Al contratar un abono, el sistema **crea en el momento una reserva hija por
cada día autorizado del período** (por ejemplo, 22 reservas de 8 a 18),
CONFIRMADAS, ligadas al abono y con `precio_total = 0` (lo pagado vive en el
abono).

Así se resuelven las dos dudas planteadas:

- **"Si es fija, ¿qué pasa con las reservas que ya existen en esa cochera?"**
  Al contratar, el sistema elige una cochera libre en **todas** las franjas
  del mes. Las reservas ya hechas nunca se tocan: si una cochera tiene una
  reserva por hora un martes a las 10, simplemente no es candidata.
- **"Si no es fija, ¿cómo garantizo que siempre tenga cochera?"** Porque el
  lugar queda reservado de antemano, día por día. Una vez contratado el abono,
  ninguna reserva por hora puede ocupar ese hueco: lo impiden los mismos
  `EXCLUDE` (`reserva_sin_solapamiento`) y el chequeo transaccional de hoy.

**Asignación de cochera** (todo dentro de una transacción, con el mismo
bloqueo de cocheras que usa `crear`):

1. Se busca una cochera compatible (tipo de vehículo, activa, no bloqueada)
   libre en todas las franjas del período, en `ORDEN_NATURAL`. Si existe, todas
   las reservas hijas van ahí (**cochera fija**).
2. Si ninguna está libre en todas, se asigna **por día** la primera cochera
   libre de esa franja. Igual cubre **todos** los días; solo cambia la
   cochera. El conductor ve un aviso: "Algunos días vas a usar otra cochera".
3. Si algún día no tiene ninguna cochera libre, el abono **no se contrata y no
   se crea nada**. El cliente quiere el mes completo, no "lo que haya", así
   que no se ofrece un abono parcial. 409 "Este estacionamiento no tiene lugar
   para un abono en esas franjas. Probá con otros días u horarios." Las fechas
   sin lugar van en `detalles` del error, por si el front las quiere mostrar,
   pero no se ofrece contratar el resto.

**De regalo** se obtiene todo lo que ya existe para reservas:

- Disponibilidad: las franjas del abono ya cuentan como ocupadas.
- Bloqueo de cochera: reasigna o cancela cada reserva hija como a cualquier
  otra.
- Ingreso por QR: el conductor con abono tiene una reserva CONFIRMADA hoy en
  su franja, y `resolverAcceso` la encuentra sin cambios.
- No show (feature posterior): un día sin ingreso es un no show de esa reserva
  hija.
- Dashboards: la ocupación sale de las reservas, igual que antes.

Con este enfoque **no hace falta una tabla `sesion_uso`**: el ingreso y el
egreso siguen viviendo en `reserva`.

### B.2 Modelo de datos

- `estacionamiento.tarifa_abono_mensual DECIMAL(10,2)`, nullable (`NULL` = no
  ofrece abonos), `>= 0`. Con esto se amplía el `CHECK
  estacionamiento_alguna_tarifa` para que también la cuente.
- `estacionamiento.cupo_abonos SMALLINT`, nullable (`NULL` = sin tope), `>= 0`:
  la cantidad máxima de abonos vigentes a la vez. Es el "cupo" del enunciado:
  el propietario reserva capacidad para el público por hora.
- Enum `estado_abono` (`VIGENTE`, `CANCELADO`, `VENCIDO`).
- Tabla `abono`:

  | columna | tipo | nota |
  |---|---|---|
  | `id_abono` | UUID PK | |
  | `id_conductor` | UUID FK usuario | |
  | `id_vehiculo` | UUID FK vehiculo | |
  | `id_estacionamiento` | UUID FK estacionamiento | |
  | `desde` | DATE | primer día |
  | `hasta` | DATE | `desde + 29 días` (30 días corridos) |
  | `dias_semana` | SMALLINT[] | 0–6, igual que `horario.dia_semana` |
  | `hora_desde`, `hora_hasta` | TIME | `hora_hasta > hora_desde` |
  | `precio_total` | DECIMAL(10,2) | se congela al contratar |
  | `estado` | `estado_abono` | |
  | `created_at` | TIMESTAMPTZ | |

- `reserva.id_abono UUID NULL` FK `abono ON DELETE RESTRICT`, con índice.
- `modalidad_reserva` suma `ABONO` (las reservas hijas usan esta modalidad).

### B.3 Reglas

- **Franjas:** un rango horario por abono (por ejemplo, de 10 a 13), aplicado
  a uno o más días de la semana (por ejemplo, solo los miércoles). Puede ser
  cualquier sub-rango del horario de atención, pero tiene que caber entero en
  el horario de cada día elegido (se reusa `validarHorario`). Si un día elegido
  está cerrado o el rango no entra: 400 indicando el día.
- **Período:** 30 días corridos desde `desde`. `desde` no puede ser en el
  pasado.
- **Precio:** `tarifa_abono_mensual`, fijo, sin prorrateo.
- **Cupo:** si `cupo_abonos` no es nulo y ya hay esa cantidad de abonos
  VIGENTES que se superponen con el período: 409 "No hay cupo de abonos".
- **Vehículo:** no puede tener reservas que se superpongan con ninguna franja
  (ya lo cubre `reserva_vehiculo_sin_solapamiento`).
- **Confirmación:** el abono nace VIGENTE y sus reservas CONFIRMADAS. El pago
  ya está hecho y el propietario no tiene que confirmar día por día.
- **Cancelación por el conductor:** el abono pasa a CANCELADO y se cancelan las
  reservas hijas futuras que no hayan empezado. No hay reembolso (el pago es
  simulado). Si en ese momento hay una reserva hija ACTIVA, no se toca.
- **Vencimiento:** el job de `vencimientos.job.js` pasa a VENCIDO los abonos con
  `hasta < hoy`.
- **Bloqueo de cochera:** sin cambios. El aviso de reasignación o cancelación
  aparece en la reserva hija de ese día.

### B.4 Backend

- `Back/src/services/abono.service.js`, con `contratar`, `listarPorConductor`,
  `listarPorEstacionamiento`, `cancelar` y `vencerAbonos`.
- Función pura `fechasDelAbono(desde, diasSemana, horaDesde, horaHasta,
  horarios)` en `Back/src/utils/` que devuelve los pares `{ inicio, fin }` en
  hora de Buenos Aires, reusando `instanteLocal` y `sumarDias` de
  `utils/horario.js`. Se prueba aislada.
- Rutas (`abono.routes.js`, montadas en `/abonos`):
  - `POST /abonos` (CONDUCTOR) con `{ id_estacionamiento, id_vehiculo, desde,
    dias_semana, hora_desde, hora_hasta }`.
  - `GET /abonos` (CONDUCTOR): los propios.
  - `PATCH /abonos/:id/cancelar` (CONDUCTOR).
  - `GET /estacionamientos/:id/abonos` (PROPIETARIO dueño).
- `SELECT_DETALLE` de reserva devuelve `id_abono`, para que el front muestre
  "Abono" en vez del precio.
- La cancelación individual de una reserva hija por `PATCH
  /reservas/:id/cancelar` se rechaza con 409 "Es parte de un abono; cancelá el
  abono".

### B.5 Frontend

- **Propietario:** en el formulario del estacionamiento, los campos "Tarifa de
  abono mensual" y "Cupo de abonos". En su página de reservas, filtro o
  pestaña "Abonos" con los abonos vigentes.
- **Conductor:** en el detalle del estacionamiento (si ofrece abono), el botón
  "Contratar abono mensual". El formulario pide vehículo, fecha de inicio, días
  (chips L M M J V S D) y rango horario, y muestra un resumen con precio, días
  incluidos y cochera asignada antes de confirmar.
- **"Mis reservas":** sección "Mis abonos" con período, franjas, cochera y el
  botón "Cancelar abono". Las reservas hijas de cada día aparecen como
  cualquier otra reserva, con la etiqueta "Abono" y sin botón de cancelar.

### B.6 Pruebas

- `fechasDelAbono`: días correctos, omite los días cerrados y respeta el
  horario de Buenos Aires.
- Contratar con una cochera libre todo el mes: N reservas en la misma cochera.
- Contratar con una cochera ocupada un día: se usa otra cochera fija libre.
- Contratar sin ninguna cochera libre todo el mes: asignación por día.
- Contratar con un día sin ninguna cochera: 409 y no se crea ni el abono ni ninguna reserva hija.
- Abono solo los miércoles de 10 a 13 en un estacionamiento de 10 a 22: 4 o 5 reservas hijas, todas miércoles.
- Día elegido cerrado, o rango que excede el horario de ese día: 400.
- Cupo agotado: 409.
- Estacionamiento sin `tarifa_abono_mensual`: 409.
- Ingreso por QR con abono dentro de la franja: ACTIVA.
- Ingreso por QR con abono fuera de la franja: 409 con la hora.
- Cancelar el abono: las futuras quedan CANCELADAS y las pasadas o la ACTIVA
  no cambian.
- Cancelar una reserva hija suelta: 409.
- Una reserva por hora en una franja tomada por el abono: no se le asigna esa
  cochera (o 409 si no hay otra).
- Job: un abono vencido pasa a VENCIDO.

---

## Fuera de alcance

- No show, el rol Administrador y los dashboards: son specs propias. Esta spec
  deja preparados `ingreso_real` y `reserva.id_abono` para que los usen.
- Pagos reales, prorrateo y renovación automática del abono.
- Más de una franja horaria distinta por abono.
- Lector de QR dentro de la app.
