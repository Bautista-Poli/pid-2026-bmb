import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { EstadoReserva, ETIQUETA_ESTADO_RESERVA, ETIQUETA_MODALIDAD, ReservaDetallada } from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { desdeFechaISO } from '@app/utils/fecha.util';
import { Boton, Etiqueta, TonoEtiqueta } from '@app/components/ui';

/** El color del badge adelanta el estado antes de leer la palabra. */
const TONO_ESTADO: Record<EstadoReserva, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  EN_CURSO: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
};

/** Que puede hacer el propietario segun como este la reserva. */
const PASOS: Partial<Record<EstadoReserva, string>> = {
  PENDIENTE: 'Confirmar',
  CONFIRMADA: 'Registrar ingreso',
  EN_CURSO: 'Registrar egreso',
};

/**
 * Fila de reserva dentro de una tarjeta con `overflow: hidden`.
 * `vista` decide que datos van al frente: la cochera y la patente para el
 * propietario, el estacionamiento y la fecha para el conductor.
 */
@Component({
  selector: 'app-fila-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Etiqueta, Boton],
  templateUrl: './fila-reserva.html',
  // La fila lleva su divisor arriba. Cuando es la primera de la tarjeta ese
  // divisor se solapa con el borde de la tarjeta, asi que se suprime.
  host: { class: 'block first:[&>div]:border-t-0' },
})
export class FilaReserva {
  readonly reserva = input.required<ReservaDetallada>();
  readonly vista = input<'CONDUCTOR' | 'PROPIETARIO'>('PROPIETARIO');
  readonly permiteCancelar = input(false);
  /** Botones del ciclo (confirmar / ingreso / egreso) para el propietario. */
  readonly permiteGestionar = input(false);
  /** Muestra el spinner en el boton mientras se procesa esta reserva. */
  readonly cancelando = input(false);
  readonly procesando = input(false);

  readonly cancelar = output<ReservaDetallada>();
  readonly avanzar = output<ReservaDetallada>();

  protected readonly etiquetaEstado = ETIQUETA_ESTADO_RESERVA;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly activa = computed(() => reservaEnJuego(this.reserva()));
  protected readonly tonoEstado = computed(() => TONO_ESTADO[this.reserva().estado]);

  protected readonly titulo = computed(() => {
    const reserva = this.reserva();
    if (this.vista() === 'CONDUCTOR') return reserva.estacionamiento.nombre;
    const cochera = reserva.cochera?.identificador ?? 'Sin asignar';
    return `${cochera} · ${reserva.vehiculo.patente}`;
  });

  protected readonly fecha = computed(() => desdeFechaISO(this.reserva().fecha));

  /** El unico paso que le queda al propietario, o null si no hay nada que hacer. */
  protected readonly paso = computed(() => PASOS[this.reserva().estado]);

  /** El conductor no puede cancelar una reserva que ya arranco. */
  protected readonly cancelable = computed(
    () => this.activa() && this.reserva().estado !== 'EN_CURSO',
  );
}
