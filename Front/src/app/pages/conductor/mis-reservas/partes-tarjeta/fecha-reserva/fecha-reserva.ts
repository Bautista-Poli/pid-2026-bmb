import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { desdeFechaISO } from '@app/utils/fecha.util';

const DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const MES = new Intl.DateTimeFormat('es-AR', { month: 'short' });

/** "sept." -> "sept": sin el punto de la abreviatura, que ensucia los bloques de fecha. */
const abreviar = (formato: Intl.DateTimeFormat, fecha: Date) =>
  formato.format(fecha).replace('.', '');

/** Las tres partes de una fecha ISO como las muestran las tarjetas: "lun", 28, "sep". */
export function partesDeFecha(fechaISO: string) {
  const dia = desdeFechaISO(fechaISO);
  return { semana: abreviar(DIA_SEMANA, dia), numero: dia.getDate(), mes: abreviar(MES, dia) };
}

/** Bloque con el dia de la reserva: dia de la semana, numero y mes. */
@Component({
  selector: 'app-fecha-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fecha-reserva.html',
  styleUrl: './fecha-reserva.css',
})
export class FechaReserva {
  /** Fecha ISO (`yyyy-mm-dd`). */
  readonly fecha = input.required<string>();

  protected readonly bloqueFecha = computed(() => partesDeFecha(this.fecha()));
}
