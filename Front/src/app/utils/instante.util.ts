/**
 * Fechas en texto ISO (`2026-10-01T03:00:00.000Z`) para mandarle al back.
 *
 *   instante()                               // ahora
 *   instante({ mes: 10 })                    // 1 de octubre de este año, 00:00
 *   instante({ mes: 10, dia: 15, hora: 8 })  // 15 de octubre a las 8:00
 *   instante({ hora: 8 })                    // hoy a las 8:00
 *   instante({ dia: 1, sumar: { meses: -1 } }) // el 1 del mes pasado, 00:00
 *
 * Para correr la hora de ahora sin ponerla en cero esta `desdeAhora`, mas abajo.
 * Todo se arma en la hora de la computadora del usuario.
 */
export interface PartesDeFecha {
  anio?: number;
  /** De 1 (enero) a 12 (diciembre). */
  mes?: number;
  dia?: number;
  /** De 0 a 23. */
  hora?: number;
  minuto?: number;
  /** Lo que se le suma (o resta, con negativos) a la fecha ya armada. */
  sumar?: Tiempo;
}

/** Una cantidad de tiempo; con negativos, hacia atras. */
export interface Tiempo {
  meses?: number;
  dias?: number;
  horas?: number;
  minutos?: number;
}

/**
 * El instante que describen las partes.
 *
 * - Sin año, mes, dia, hora ni minuto: es ahora mismo.
 * - Si se indica alguno: lo mas grande que falta es lo de hoy (el año, el mes,
 *   el dia) y lo mas chico que falta arranca desde el principio (dia 1, hora
 *   0, minuto 0).
 * - Al final se aplica `sumar`.
 *
 * Los valores fuera de rango se acomodan solos: mes 0 es diciembre del año
 * anterior, mes 13 es enero del siguiente, dia 0 es el ultimo del mes anterior.
 */
export function instante(partes: PartesDeFecha = {}, hoy = new Date()): string {
  // De lo mas grande a lo mas chico: lo que se indico, lo de hoy, y el minimo.
  const piezas: [number | undefined, number, number][] = [
    [partes.anio, hoy.getFullYear(), 0],
    [partes.mes, hoy.getMonth() + 1, 1],
    [partes.dia, hoy.getDate(), 1],
    [partes.hora, hoy.getHours(), 0],
    [partes.minuto, hoy.getMinutes(), 0],
  ];
  const primera = piezas.findIndex(([indicada]) => indicada !== undefined);

  let fecha = new Date(hoy);
  if (primera !== -1) {
    const [anio, mes, dia, hora, minuto] = piezas.map(
      ([indicada, deHoy, minimo], i) => indicada ?? (i < primera ? deHoy : minimo),
    );
    fecha = new Date(anio, mes - 1, dia, hora, minuto);
  }

  const { meses = 0, dias = 0, horas = 0, minutos = 0 } = partes.sumar ?? {};
  fecha.setMonth(fecha.getMonth() + meses);
  fecha.setDate(fecha.getDate() + dias);
  fecha.setHours(fecha.getHours() + horas);
  fecha.setMinutes(fecha.getMinutes() + minutos);

  return fecha.toISOString();
}

/**
 * La hora de ahora corrida un tiempo, sin poner nada en cero:
 *
 *   desdeAhora({ minutos: 30 })    // dentro de 30 minutos
 *   desdeAhora({ minutos: -30 })   // hace 30 minutos
 *   desdeAhora({ dias: -7 })       // hace 7 dias, a esta misma hora
 */
export function desdeAhora(tiempo: Tiempo, hoy = new Date()): string {
  return instante({ sumar: tiempo }, hoy);
}

/** El dia de un `<input type="date">` (`2026-11-15`) a las 00:00. */
export function instanteDeTexto(texto: string): string {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return instante({ anio, mes, dia });
}
