// Selector de la hora de ingreso del flujo de reserva: una opcion por hora, con la de
// salida segun la duracion; las no disponibles se muestran con su motivo.
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Cargando } from '@app/components/ui';
import { Duracion, FechaISO, FranjaDisponible, HoraHHmm, Id, TipoVehiculo } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';

export interface RangoHorario {
  horaDesde: HoraHHmm;
  horaHasta: HoraHHmm;
}

/**
 * Hora de ingreso: una opcion por hora, con la hora de salida segun la
 * duracion elegida. Solo se muestran los ingresos posibles (dentro del horario
 * y no pasados); los que no tienen cochera libre quedan tachados.
 *
 * Se arregla solo: pide la disponibilidad para ese dia, tipo de vehiculo y
 * duracion, y cada vez que llega mantiene la hora elegida si sigue libre o
 * propone la primera libre. A quien lo usa solo le deja el horario elegido
 * (`null` si no hay ninguno libre):
 *
 *   <app-selector-franja [estacionamientoId]="id" [fecha]="fecha()" [tipoVehiculo]="tipo" [duracion]="duracion()" [(rango)]="rango" />
 *
 * Lo que se le pone adentro (una nota, por ejemplo) se ve debajo de las horas.
 */
@Component({
  selector: 'app-selector-franja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Cargando],
  templateUrl: './selector-franja.html',
  styleUrl: './selector-franja.css',
  host: { class: 'block' },
})
export class SelectorFranja {
  private readonly reservas = inject(ReservaService);

  readonly estacionamientoId = input.required<Id>();
  readonly fecha = input<FechaISO | null>(null);
  /** Tipo del vehiculo con el que se reserva; sin vehiculo no hay ingresos para ofrecer. */
  readonly tipoVehiculo = input<TipoVehiculo | null>(null);
  readonly duracion = input.required<Duracion>();

  /** Hora de ingreso y de salida elegidas; `null` si no hay ninguna libre. */
  readonly rango = model<RangoHorario | null>(null);

  /** Los ingresos posibles dependen del dia, del tipo de vehiculo y de cuantas horas se quieren. */
  protected readonly disponibilidad = rxResource({
    params: () => {
      const fecha = this.fecha();
      const tipoVehiculo = this.tipoVehiculo();
      const { horas, modalidad } = this.duracion();
      return fecha && tipoVehiculo
        ? {
            estacionamientoId: this.estacionamientoId(),
            fecha,
            tipoVehiculo,
            modalidad,
            horas: modalidad === 'HORA' ? horas : undefined,
          }
        : undefined;
    },
    stream: ({ params }) => this.reservas.disponibilidad(params),
    defaultValue: [] as FranjaDisponible[],
  });

  /** Los ingresos que se muestran: los libres y los que no tienen cochera (tachados). */
  protected readonly visibles = computed(() =>
    this.disponibilidad.value().filter((f) => f.disponible || f.causa === 'SIN_COCHERA'),
  );

  constructor() {
    // Al llegar los ingresos: se mantiene la hora elegida si sigue libre (con la
    // salida de la nueva duracion); si no, queda propuesta la primera libre.
    effect(() => {
      const franjas = this.disponibilidad.value();
      if (this.disponibilidad.isLoading()) return;
      untracked(() => {
        const actual = this.rango();
        const elegida =
          franjas.find((f) => f.disponible && f.horaDesde === actual?.horaDesde) ??
          franjas.find((f) => f.disponible);
        if (elegida?.horaDesde !== actual?.horaDesde || elegida?.horaHasta !== actual?.horaHasta) {
          this.rango.set(elegida ? { horaDesde: elegida.horaDesde, horaHasta: elegida.horaHasta } : null);
        }
      });
    });
  }

  /** Vuelve a pedir la disponibilidad (p. ej. si la ultima cochera se ocupo mientras se elegia). */
  recargar(): void {
    this.disponibilidad.reload();
  }

  protected esActiva(franja: FranjaDisponible): boolean {
    return this.rango()?.horaDesde === franja.horaDesde;
  }

  protected diaSiguiente(franja: FranjaDisponible): boolean {
    return franja.fechaHasta !== null && franja.fechaHasta !== this.fecha();
  }
}
