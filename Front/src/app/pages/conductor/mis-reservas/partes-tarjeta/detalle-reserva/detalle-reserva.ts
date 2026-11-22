import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icono } from '@app/components/ui';
import { ChapaPatente } from '@app/components/vehiculo';
import { ETIQUETA_MODALIDAD, ETIQUETA_TIPO_VEHICULO, ReservaDetallada, TURNOS } from '@app/models';
import { linksComoLlegar } from '@app/utils/mapas.util';

/**
 * Lo que comparten las tarjetas de una reserva proxima y de una en curso: con
 * que auto y en que cochera es, como llegar, el aviso si el estacionamiento la
 * reasigno y, al pie, lo que cuesta. Los botones de la tarjeta (ver QR,
 * cancelar) van adentro y quedan al pie, a la derecha del precio:
 *
 *   <app-detalle-reserva [reserva]="reserva">
 *     <app-ver-qr [reserva]="reserva" />
 *   </app-detalle-reserva>
 */
@Component({
  selector: 'app-detalle-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, ChapaPatente],
  templateUrl: './detalle-reserva.html',
  styleUrl: './detalle-reserva.css',
})
export class DetalleReserva {
  readonly reserva = input.required<ReservaDetallada>();

  /** "Toyota Corolla · Auto" */
  protected readonly vehiculo = computed(() => {
    const { marca, modelo, tipo } = this.reserva().vehiculo;
    const nombre = [marca, modelo].filter(Boolean).join(' ');
    return [nombre, ETIQUETA_TIPO_VEHICULO[tipo]].filter(Boolean).join(' · ');
  });

  /** Un enlace por app de mapas, para abrir la navegacion hasta el estacionamiento. */
  protected readonly links = computed(() => linksComoLlegar(this.reserva().estacionamiento.direccion));

  /** Si se reservo con un abono: no tiene monto. */
  protected readonly conAbono = computed(() => this.reserva().abono !== null);

  /** "$ 6.000", o "Abono" si se reservo con uno. */
  protected readonly monto = computed(() =>
    this.conAbono() ? 'Abono' : `$ ${this.reserva().precioTotal.toLocaleString('es-AR')}`,
  );

  /** Como se cobra ("Por hora", "Estadía · 12 h") o, con abono, el turno ("Turno mañana"). */
  protected readonly comoSeCobra = computed(() => {
    const { abono, modalidad } = this.reserva();
    return abono ? `Turno ${TURNOS[abono.turno].etiqueta.toLowerCase()}` : ETIQUETA_MODALIDAD[modalidad];
  });
}
