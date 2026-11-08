import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HoraHHmm, ModalidadReserva } from '@app/models';

/** Resumen de la reserva: duracion, cochera asignada y total. */
@Component({
  selector: 'app-resumen-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './resumen-reserva.html',
  host: { class: 'block' },
})
export class ResumenReserva {
  readonly horaDesde = input<HoraHHmm | null>(null);
  readonly horaHasta = input<HoraHHmm | null>(null);
  readonly modalidad = input<ModalidadReserva>('HORA');
  readonly horas = input(0);
  readonly total = input(0);
  /** Identificador de la cochera, cuando ya esta asignada. */
  readonly cochera = input<string | null>(null);
  /** Como se cobra: "$900 por hora", "Estadía · 12 h". */
  readonly tarifa = input<string | null>(null);
  /** Aclaracion bajo el total (p. ej. el ahorro de una estadia). */
  readonly nota = input<string | null>(null);

  /** "3 h · 10:00 – 13:00"; si termina al otro dia, "12 h · 19:00 – 07:00 (+1 día)". */
  protected readonly duracion = computed(() => {
    const desde = this.horaDesde();
    const hasta = this.horaHasta();
    if (!desde) return `${this.horas()} h · elegí la hora de ingreso`;
    if (!hasta) return `${this.horas()} h desde las ${desde}`;
    const otroDia = hasta <= desde ? ' (+1 día)' : '';
    return `${this.horas()} h · ${desde} – ${hasta}${otroDia}`;
  });

  /** La cochera la asigna el backend al confirmar. */
  protected readonly textoCochera = computed(() => this.cochera() ?? 'Se asigna al confirmar');

  protected readonly totalFormateado = computed(() => this.total().toLocaleString('es-AR'));
}
