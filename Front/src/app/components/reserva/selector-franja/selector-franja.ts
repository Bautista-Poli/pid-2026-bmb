import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FechaISO, FranjaDisponible, HoraHHmm } from '@app/models';

export interface RangoHorario {
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
}

/**
 * Hora de ingreso: una opcion por hora, con la hora de salida segun la
 * duracion elegida. Solo se muestran los ingresos posibles (dentro del horario
 * y no pasados); los que no tienen lugar quedan tachados.
 */
@Component({
  selector: 'app-selector-franja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './selector-franja.html',
  styleUrl: './selector-franja.css',
  host: { class: 'block' },
})
export class SelectorFranja {
  readonly franjas = input.required<FranjaDisponible[]>();
  readonly horaDesde = input<HoraHHmm | null>(null);
  /** Dia pedido, para marcar las salidas del dia siguiente. */
  readonly fecha = input<FechaISO | null>(null);

  readonly rangoElegido = output<RangoHorario>();

  protected readonly visibles = computed(() =>
    this.franjas().filter((f) => f.disponible || f.causa === 'SIN_LUGAR'),
  );

  protected esActiva(franja: FranjaDisponible): boolean {
    return this.horaDesde() === franja.horaDesde;
  }

  protected diaSiguiente(franja: FranjaDisponible): boolean {
    return franja.fechaHasta !== null && franja.fechaHasta !== this.fecha();
  }
}
