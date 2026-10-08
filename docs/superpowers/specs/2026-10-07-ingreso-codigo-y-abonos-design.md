# Ingreso/egreso por código o QR y abonos mensuales

Rama: `feat/ingreso-codigo-y-abonos`, sobre `development`.

Cubre dos puntos de la entrega que se diseñan juntos porque el segundo depende
del primero:

1. "Registrar ingreso y egreso mediante código o QR, o mediante una acción
   simulada del operador."
2. "Incorporar abonos mensuales con cupo o franjas autorizadas."

Se implementan en ese orden (Parte A y Parte B), cada una con su plan.

## Definiciones de los profesores (2026-10-08)

- **El QR es único por reserva.** Es un identificador que valida esa reserva y
  la distingue de las demás. El mismo QR sirve para la entrada y para la
  salida.
- **El abono se paga por adelantado y da un cupo de usos.** No es una reserva:
  el conductor paga de antemano y después puede hacer reservas **gratis**
  dentro de los horarios del abono, hasta agotar el cupo ("x cupos en y
  horas").
- **Los abonos se definen por turno: mañana, tarde o noche.** El abono define
  la cantidad de veces que el conductor puede estacionar en ese turno.

Esto reemplaza los supuestos anteriores (QR por estacionamiento y abono con
reservas diarias generadas al contratar).

## Preguntas abiertas

Quedan supuestos marcados en el texto como **(supuesto)**. Conviene
confirmarlos antes de implementar la Parte B:

1. **Horario de cada turno.** ¿Lo fija el sistema o lo define cada
   estacionamiento? Supuesto: fijo, mañana 06–12, tarde 12–18 y noche 18–24
   (así ninguno cruza la medianoche, que hoy las reservas por hora no
   permiten).
2. **"x cupos en y horas".** ¿"y horas" son las horas del turno, o el máximo
   de horas de cada uso? Supuesto: las horas del turno; cada reserva con el
   abono puede durar lo que quiera dentro del turno y consume 1 cupo.
3. **Vigencia.** ¿Mes calendario o 30 días desde la compra? Supuesto: 30 días
   corridos desde la compra.
4. **Cancelación de una reserva con abono.** ¿Devuelve el cupo? Supuesto: sí,
   si se cancela antes de que empiece. Un no show (feature aparte) lo consume.
5. **Garantía de lugar.** ¿El abono asegura que haya cochera, o solo da el
   derecho a reservar gratis si hay lugar? Supuesto: no garantiza lugar; cada
   reserva con abono compite por las cocheras como cualquier otra.
6. **Confirmación.** ¿Una reserva con abono necesita que el propietario la
   confirme? Supuesto: no, nace CONFIRMADA porque ya está paga.

---

## Parte A: ingreso y egreso con el QR de la reserva

### Objetivo

Cada reserva tiene su propio código y su QR. El conductor lo muestra al llegar
y al irse; el operador (hoy, el propietario) lo escanea o tipea el código, y
el sistema registra el ingreso o el egreso según el estado de la reserva. Los
botones del propietario que ya existen ("Registrar ingreso" / "Registrar
egreso") quedan como la **acción simulada del operador**.

### A.1 Modelo de datos (`Back/src/db/schema.sql`, idempotente)

- `reserva.codigo_acceso VARCHAR(8)`, `UNIQUE`, `NOT NULL`.
- Alfabeto sin caracteres ambiguos: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31
  símbolos, sin `0 O 1 I L`). Con 8 caracteres hay unos 850 billones de
  combinaciones, así que no se puede adivinar el código de otra reserva.
- Lo genera la base: una función SQL `generar_codigo_acceso()` como `DEFAULT`
  de la columna, así el `INSERT` de `reserva.service.js: crear` no cambia. Las
  reservas existentes se rellenan en la migración.
- Se muestra partido como `K7MQ-2XTR`. Al validar se ignoran guiones, espacios
  y mayúsculas/minúsculas.

### A.2 Backend

**Refactor de `reserva.service.js`.** Hoy `registrarIngreso` y
`registrarEgreso` buscan la reserva por id con `bloquearReservaDelPropietario`.
Se separan las reglas en dos funciones internas que reciben una reserva ya
bloqueada:

- `aplicarIngreso(client, reserva)`: las validaciones actuales (no PENDIENTE,
  sin ingreso previo, desde `MARGEN_INGRESO_MS` antes del inicio hasta el
  fin), luego `ingreso_real = now()` y CONFIRMADA → ACTIVA.
- `aplicarEgreso(client, reserva)`: las validaciones actuales, luego
  `egreso_real = now()` y ACTIVA → FINALIZADA.

Las usan las dos entradas: por id de reserva (`PATCH /reservas/:id/ingreso|egreso`,
sin cambios de contrato) y por código (nueva).

**Resolución por código** (`resolverAcceso(client, idPropietario, codigo)`):

1. Normaliza el código y busca la reserva con ese `codigo_acceso` en un
   estacionamiento del propietario. Si no existe, o es de otro propietario:
   404 "El código no corresponde a ninguna reserva de tus estacionamientos"
   (el mismo mensaje en los dos casos, para no revelar reservas ajenas).
2. Decide la acción según el estado:
   - ACTIVA → `EGRESO`. Vale aunque `fin` ya haya pasado: el auto sigue
     adentro.
   - CONFIRMADA dentro de la ventana de ingreso → `INGRESO`.
   - CONFIRMADA antes de la ventana → 409 "La reserva empieza a las HH:MM; se
     puede ingresar desde las HH:MM" (hora de Buenos Aires).
   - PENDIENTE → 409 "La reserva todavía no está confirmada".
   - CANCELADA o FINALIZADA → 409 "La reserva está cancelada / ya terminó".
3. Un egreso dentro de los 60 s posteriores al ingreso se rechaza (409
   "Acabás de registrar el ingreso"), porque casi seguro es un doble escaneo.

**Endpoints nuevos** (`reserva.routes.js`, solo `PROPIETARIO`):

- `GET /reservas/acceso/:codigo`: vista previa sin efectos. Devuelve la
  reserva (estacionamiento, cochera, vehículo, franja) y la acción que
  corresponde. Alimenta la pantalla de confirmación.
- `POST /reservas/acceso` con `{ codigo }`: dentro de una transacción bloquea
  la reserva (`FOR UPDATE`), vuelve a resolver la acción (puede haber cambiado
  desde la vista previa) y llama a `aplicarIngreso` o `aplicarEgreso`. Responde
  `{ accion, reserva }`.

**Quién ve el código.** `codigo_acceso` va en `SELECT_DETALLE`, que solo usan
los listados del conductor (sus reservas) y del propietario (las reservas de
sus estacionamientos). No aparece en ningún endpoint público.

**Validación:** `reserva.validator.js` agrega el esquema de `{ codigo }`.

### A.3 Frontend

**Conductor**, en "Mis reservas":

- Las tarjetas CONFIRMADA y ACTIVA tienen el botón "Ver QR". Abre un modal con
  el QR grande, el código `K7MQ-2XTR` debajo y la indicación "Mostralo al
  entrar y al salir".
- El QR codifica `https://<origen del front>/propietario/acceso/K7MQ2XTR` y se
  genera con la librería `qrcode` (npm) del lado del cliente.

**Propietario (operador):**

- Ruta nueva `/propietario/acceso/:codigo` (rama `propietario`, con
  `authGuard` + `rolGuard`). Si no hay sesión, `authGuard` manda a
  `/ingresar?redirigir=...` y vuelve después del login.
- **No hace falta un lector de QR dentro de la app**: el operador escanea el
  QR con la cámara de su celular y se abre esta pantalla.
- La pantalla llama a la vista previa y muestra, por ejemplo, "Cochera A-12 ·
  14:00–16:00 · ABC123 · Juan Pérez" con el botón "Registrar ingreso" (o
  "Registrar egreso"). Al confirmar muestra el resultado ("Ingreso registrado
  14:03"). Los errores aparecen en lenguaje claro.
- En el tablero y en "Reservas recibidas", un botón "Ingresar código" abre un
  campo para tipear el código (por si la cámara no lee el QR) y navega a esa
  pantalla.
- Los botones actuales por reserva siguen como acción simulada del operador.

### A.4 Pruebas (`Back/pruebas/acceso.test.mjs`)

- Cada reserva nueva tiene un código con el formato esperado, distinto del de
  las demás.
- Ingreso por código en la ventana: la reserva pasa a ACTIVA y la cochera a
  OCUPADA.
- Egreso con el mismo código: la reserva pasa a FINALIZADA y la cochera a
  LIBRE.
- Egreso aunque la franja ya haya terminado.
- Doble escaneo: el segundo no registra el egreso enseguida (409).
- El código se acepta en minúsculas y con guion.
- Código inexistente, mal formado o basura: 404 (o 400), nunca 500.
- Código de una reserva de otro propietario: 404 con el mismo mensaje.
- Reserva PENDIENTE, CANCELADA o FINALIZADA: 409.
- Demasiado temprano: 409 con la hora desde la que se puede ingresar.
- La vista previa no cambia nada.
- Un conductor no puede usar los endpoints de acceso (403).
- El conductor ve el código de sus reservas; un endpoint público no lo expone.
- Los endpoints `PATCH /:id/ingreso|egreso` siguen pasando sus pruebas
  actuales.

---

## Parte B: abonos mensuales por turno

### Objetivo

El propietario ofrece planes de abono por turno (mañana, tarde o noche), cada
uno con una cantidad de usos y un precio; por ejemplo, "Turno mañana · 20
usos · $40.000". El conductor compra un abono pagando por adelantado (de forma
simulada). Después hace reservas **gratis** en ese estacionamiento, dentro del
horario del turno, y cada reserva consume un uso del cupo. Cada reserva tiene
su propio QR como cualquier otra (Parte A).

### B.1 Turnos

Constantes en el código (como las duraciones de estadía y jornada), con su
espejo en el front **(supuesto, ver pregunta 1)**:

| Turno | Desde | Hasta |
|---|---|---|
| `MANANA` | 06:00 | 12:00 |
| `TARDE` | 12:00 | 18:00 |
| `NOCHE` | 18:00 | 24:00 |

Una reserva con abono tiene que empezar y terminar dentro del turno, el mismo
día, y además dentro del horario de atención (`validarHorario`, igual que una
reserva por hora).

### B.2 Modelo de datos

- Enum `turno_abono` (`MANANA`, `TARDE`, `NOCHE`).
- Enum `estado_abono` (`VIGENTE`, `CANCELADO`, `VENCIDO`).
- Tabla `plan_abono`, los planes que ofrece el propietario:

  | columna | tipo | nota |
  |---|---|---|
  | `id_plan` | UUID PK | |
  | `id_estacionamiento` | UUID FK estacionamiento | `ON DELETE CASCADE` |
  | `turno` | `turno_abono` | |
  | `cupos` | SMALLINT | `> 0`, usos incluidos |
  | `precio` | DECIMAL(10,2) | `>= 0` |
  | `activo` | BOOLEAN | baja lógica; los abonos ya vendidos no cambian |

  Único por `(id_estacionamiento, turno)` entre los activos: un plan por turno.

- Tabla `abono`, lo que compró el conductor. Copia turno, cupos y precio del
  plan al momento de la compra, para que un cambio posterior del plan no lo
  altere (igual que `reserva.precio_total`):

  | columna | tipo | nota |
  |---|---|---|
  | `id_abono` | UUID PK | |
  | `id_conductor` | UUID FK usuario | |
  | `id_estacionamiento` | UUID FK estacionamiento | |
  | `id_plan` | UUID FK plan_abono | referencia, no fuente de verdad |
  | `turno` | `turno_abono` | congelado |
  | `cupos_totales` | SMALLINT | congelado |
  | `precio_total` | DECIMAL(10,2) | congelado |
  | `desde` | DATE | día de la compra |
  | `hasta` | DATE | `desde + 29 días` **(supuesto, pregunta 3)** |
  | `estado` | `estado_abono` | |
  | `created_at` | TIMESTAMPTZ | |

- `reserva.id_abono UUID NULL`, FK a `abono` `ON DELETE RESTRICT`, con índice.
- `modalidad_reserva` suma `ABONO`.
- Los **cupos usados** no se guardan: se cuentan como las reservas del abono
  que no están CANCELADAS. Así nunca quedan desincronizados con las reservas
  reales.

### B.3 Reglas

**Comprar un abono** (`POST /abonos` con `{ id_plan }`):

- El plan tiene que estar activo y su estacionamiento publicado y activo.
- Se crea VIGENTE, con los datos del plan copiados y `precio_total` = precio
  del plan.
- Un conductor puede tener varios abonos (de distintos turnos o
  estacionamientos).

**Reservar con abono** (`POST /reservas` con `id_abono`, sin `modalidad`):

1. Bloquea el abono (`FOR UPDATE`) para que dos reservas simultáneas no
   consuman el mismo último cupo.
2. Valida que el abono sea del conductor, esté VIGENTE y la reserva caiga
   entre `desde` y `hasta`.
3. Valida que el estacionamiento sea el del abono y que la franja esté dentro
   del turno.
4. Cuenta los cupos usados; si llegó a `cupos_totales`: 409 "No te quedan usos
   en este abono".
5. Sigue el flujo normal de `crear` (vehículo libre, asignación de cochera con
   bloqueos, `EXCLUDE`), con `modalidad = ABONO`, `precio_total = 0`,
   `id_abono` y estado CONFIRMADA **(supuesto, pregunta 6)**.
6. Si no hay cochera libre, 409 como cualquier reserva: el abono no garantiza
   lugar **(supuesto, pregunta 5)**.

**Cancelar una reserva con abono:** mismas reglas que hoy. Al quedar
CANCELADA deja de contar, así que el cupo vuelve **(supuesto, pregunta 4)**.

**Cancelar el abono** (`PATCH /abonos/:id/cancelar`): pasa a CANCELADO y se
cancelan sus reservas futuras que no empezaron. Una ACTIVA no se toca. No hay
reembolso (el pago es simulado).

**Vencimiento:** el job de `vencimientos.job.js` pasa a VENCIDO los abonos con
`hasta < hoy`. Sus reservas ya hechas siguen su ciclo normal.

**Ingreso y egreso:** cada reserva con abono tiene su propio código y QR, y
pasa por la Parte A sin cambios.

### B.4 Backend

- `Back/src/services/abono.service.js`: planes (`crearPlan`, `actualizarPlan`,
  `darDeBajaPlan`, `listarPlanes`) y abonos (`comprar`, `listarPorConductor`,
  `listarPorEstacionamiento`, `cancelar`, `vencerAbonos`).
- `Back/src/utils/turnos.js`: `TURNOS` y la función pura
  `motivoFueraDeTurno(turno, inicio, fin)`, que devuelve un motivo o `null`
  (como `motivoFueraDeHorario`). Se prueba aislada.
- `reserva.service.js: crear` acepta `id_abono` y aplica las reglas de B.3
  antes de insertar. `reserva.validator.js` acepta `id_abono` y lo hace
  excluyente con `modalidad`.
- Rutas:
  - `GET /estacionamientos/:id/planes-abono` (público): planes activos.
  - `POST`, `PATCH`, `DELETE /estacionamientos/:id/planes-abono[/:idPlan]`
    (PROPIETARIO dueño).
  - `POST /abonos` y `GET /abonos` (CONDUCTOR): comprar y listar los propios,
    con `cupos_usados` y `cupos_restantes` calculados.
  - `PATCH /abonos/:id/cancelar` (CONDUCTOR).
  - `GET /estacionamientos/:id/abonos` (PROPIETARIO dueño): abonos vendidos.
- `SELECT_DETALLE` de reserva devuelve `id_abono` y el turno, para que el
  front muestre "Abono · Turno mañana" en lugar del precio.

### B.5 Frontend

- **Propietario:** en la edición del estacionamiento, una sección "Abonos" con
  un plan por turno (activar, cupos, precio). Una vista de abonos vendidos con
  conductor, turno, usos y vencimiento.
- **Conductor:**
  - En el detalle del estacionamiento, los planes disponibles y el botón
    "Comprar abono", con un resumen (turno, usos, vigencia, precio) antes de
    confirmar.
  - "Mis abonos": cada abono con estacionamiento, turno, usos restantes
    (por ejemplo, "14 de 20") y vencimiento, más el botón "Reservar con este
    abono" y "Cancelar abono".
  - En la pantalla de reserva, si tiene un abono vigente de ese
    estacionamiento, la opción "Usar abono": limita los horarios al turno,
    muestra el precio en $0 y descuenta un uso.
  - Las reservas con abono aparecen en "Mis reservas" con la etiqueta "Abono"
    y su QR como cualquier otra.

### B.6 Pruebas

- `motivoFueraDeTurno`: dentro, en el borde, fuera y cruzando de turno.
- El propietario crea un plan por turno; un segundo plan activo del mismo
  turno da 409; otro propietario no puede tocarlo.
- Comprar un plan activo crea un abono VIGENTE con los datos copiados;
  cambiar el plan después no cambia el abono.
- Reservar con abono dentro del turno: CONFIRMADA, precio 0, consume un uso.
- Reservar fuera del turno, en otro estacionamiento, antes o después de la
  vigencia, o con un abono ajeno, CANCELADO o VENCIDO: 409 (o 404 si es ajeno).
- Sin usos restantes: 409.
- Dos reservas simultáneas por el último uso: solo una se crea.
- Cancelar una reserva con abono devuelve el uso.
- Cancelar el abono cancela sus reservas futuras y deja la ACTIVA.
- Job: un abono vencido pasa a VENCIDO.
- Ingreso y egreso con el QR de una reserva con abono funcionan igual que con
  una reserva común.

---

## Fuera de alcance

- No show, el rol Administrador y los dashboards: son specs propias. Esta spec
  deja preparados `ingreso_real` y `reserva.id_abono` para que los usen.
- Pagos reales, reembolsos, prorrateo y renovación automática del abono.
- Abonos con lugar garantizado o cochera fija.
- Lector de QR dentro de la app.
