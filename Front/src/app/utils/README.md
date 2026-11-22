# Fechas para mandarle al back: `instante.util.ts`

Funciones para armar una fecha y obtenerla ya como texto ISO
(`2026-10-01T03:00:00.000Z`), que es lo que se manda en los `params` de un pedido.

```ts
import { desdeAhora, instante } from '@app/utils/instante.util';
```

Hay dos funciones principales:

| Función | Para qué |
|---|---|
| `instante({...})` | Una fecha fija. Lo que no indicás se pone en cero. |
| `desdeAhora({...})` | La hora de ahora, corrida para adelante o para atrás. No pone nada en cero. |

## `instante`: una fecha fija

Le decís las partes que te importan: `anio`, `mes`, `dia`, `hora`, `minuto`.

```ts
instante({ dia: 3 })                     // el 3 de este mes, 00:00
instante({ mes: 10 })                    // 1 de octubre de este año, 00:00
instante({ mes: 10, dia: 15 })           // 15 de octubre, 00:00
instante({ mes: 10, dia: 15, hora: 8 })  // 15 de octubre, 08:00
instante({ hora: 8 })                    // hoy a las 08:00
instante({ hora: 8, minuto: 30 })        // hoy a las 08:30
instante({ anio: 2025, mes: 12 })        // 1 de diciembre de 2025, 00:00
instante()                               // ahora mismo
```

La regla para lo que no indicás:

- **Lo más grande que falta es lo de hoy.** Si ponés solo `dia`, el año y el mes
  son los actuales.
- **Lo más chico que falta arranca desde el principio.** Si ponés solo `mes`, es
  el día 1 a las 00:00.

Los meses van de **1 (enero) a 12 (diciembre)** y las horas de 0 a 23.

Los valores fuera de rango se acomodan solos: `mes: 0` es diciembre del año
anterior, `mes: 13` es enero del siguiente, `dia: 0` es el último día del mes
anterior.

## `desdeAhora`: la hora actual corrida

Acepta `meses`, `dias`, `horas` y `minutos`. Con números negativos va para atrás.

```ts
desdeAhora({ minutos: 30 })    // dentro de 30 minutos
desdeAhora({ minutos: -30 })   // hace 30 minutos
desdeAhora({ horas: -3 })      // hace 3 horas
desdeAhora({ dias: -7 })       // hace 7 días, a esta misma hora
desdeAhora({ meses: 1 })       // dentro de un mes, a esta misma hora
```

## Las dos cosas juntas: `sumar`

Cuando necesitás una fecha puesta en cero y después corrida, `instante` acepta
`sumar`, con las mismas partes que `desdeAhora`. Primero arma la fecha y al
final le suma.

```ts
instante({ dia: 1, sumar: { meses: -1 } })     // el 1 del mes pasado, 00:00
instante({ hora: 0, sumar: { dias: -7 } })     // hace 7 días a las 00:00
instante({ hora: 0, sumar: { dias: 1 } })      // mañana a las 00:00
instante({ hora: 8, sumar: { minutos: 45 } })  // hoy a las 08:45
```

## Cómo se usa en un pedido

Para pedir algo de un período se mandan dos fechas, `desde` y `hasta`.

```ts
// en el componente: el mes pasado entero
const desde = instante({ dia: 1, sumar: { meses: -1 } });
const hasta = instante({ dia: 1 });
this.reservaService.obtenerResumen(desde, hasta).subscribe(...);

// en el service
obtenerResumen(desde: string, hasta: string) {
  return this.http.get(`${this.ruta}/resumen`, { params: { desde, hasta } });
}
```

En el back llegan en `req.query.desde` y `req.query.hasta`, y en el SQL se
comparan así:

```sql
AND r.inicio >= $2
AND r.inicio <  $3
```

`hasta` va con `<` y apunta al comienzo de lo que sigue (el 1 del mes siguiente,
las 00:00 del día siguiente). Así no hace falta escribir `23:59:59`.

Algunos períodos típicos:

| Período | `desde` | `hasta` |
|---|---|---|
| Mes pasado | `instante({ dia: 1, sumar: { meses: -1 } })` | `instante({ dia: 1 })` |
| Este mes hasta ahora | `instante({ dia: 1 })` | `instante()` |
| Hoy entero | `instante({ hora: 0 })` | `instante({ hora: 0, sumar: { dias: 1 } })` |
| Hoy de 8 a 12 | `instante({ hora: 8 })` | `instante({ hora: 12 })` |
| Últimas 3 horas | `desdeAhora({ horas: -3 })` | `instante()` |
| Octubre | `instante({ mes: 10 })` | `instante({ mes: 11 })` |

## Fecha de un `<input type="date">`

El input devuelve texto (`'2026-11-15'`). Para pasarlo a instante:

```ts
instanteDeTexto('2026-11-15')   // 15 de noviembre, 00:00
```

No uses `new Date('2026-11-15')`: lo toma como UTC y en Argentina da el día 14
a las 21:00.

## Por qué el texto termina en `03:00:00.000Z`

Las fechas se arman en la hora de la computadora del usuario y `toISOString()`
las escribe en UTC. Las 00:00 de Argentina son las 03:00 UTC: es el mismo
momento, escrito distinto. Postgres lo interpreta bien porque las columnas son
`timestamptz`.

## Tests

`Front/tests/app/utils/instante.util.spec.ts`. Las funciones aceptan un segundo
parámetro `hoy` para fijar la fecha actual en los tests.
