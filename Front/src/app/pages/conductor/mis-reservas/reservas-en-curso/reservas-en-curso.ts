import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EstadoVacio } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { TarjetaEnCurso } from './tarjeta-en-curso/tarjeta-en-curso';

/**
 * Pestaña "En curso" de Mis reservas: las reservas en las que el conductor ya
 * ingreso al estacionamiento, cada una con su reloj y el QR para salir.
 */
@Component({
  selector: 'app-reservas-en-curso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaEnCurso, EstadoVacio],
  template: `
    @for (reserva of reservas(); track reserva.id) {
      <app-tarjeta-en-curso class="aparece" [reserva]="reserva" />
    } @empty {
      <ui-estado-vacio
        titulo="No tenés ninguna reserva en curso"
        descripcion="Cuando ingreses al estacionamiento, tu reserva aparece acá con el tiempo que te queda."
      />
    }
  `,
  host: { class: 'flex flex-col gap-3' },
})
export class ReservasEnCurso {
  /** Reservas con el ingreso ya registrado (estado ACTIVA). */
  readonly reservas = input.required<ReservaDetallada[]>();
}
