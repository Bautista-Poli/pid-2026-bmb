import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import { ChapaPatente } from '@app/components/vehiculo';
import {
  ETIQUETA_MODALIDAD,
  ETIQUETA_TIPO_VEHICULO,
  TURNOS,
  direccionCorta,
  ReservaDetallada,
} from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { linksComoLlegar } from '@app/utils/mapas.util';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
import { EstadoReserva } from '../../partes-tarjeta/estado-reserva';
import { FechaReserva, partesDeFecha } from '../../partes-tarjeta/fecha-reserva';
import { ReservaEnCurso } from './reserva-en-curso/reserva-en-curso';

/**
 * Tarjeta de una reserva vigente del conductor. Si la reserva esta en curso,
 * suma arriba el bloque con el tiempo que lleva y la barra de progreso
 * (reserva-en-curso).
 */
@Component({
  selector: 'app-tarjeta-vigente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, ChapaPatente, ReservaEnCurso, EstadoReserva, AvisoReasignacion, FechaReserva],
  templateUrl: './tarjeta-vigente.html',
  host: { class: 'block' },
})
export class TarjetaVigente {
  readonly reserva = input.required<ReservaDetallada>();
  readonly cancelando = input(false);

  readonly cancelar = output<ReservaDetallada>();
  readonly verQr = output<ReservaDetallada>();

  /** El QR sirve mientras la reserva puede entrar o salir: confirmada o en curso. */
  protected readonly conQr = computed(() => {
    const r = this.reserva();
    // Una ACTIVA lo necesita para salir aunque ya haya pasado su fin.
    return r.estado === 'ACTIVA' || (r.estado === 'CONFIRMADA' && reservaEnJuego(r));
  });

  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;
  protected readonly turnos = TURNOS;

  protected readonly enCurso = computed(() => this.reserva().estado === 'ACTIVA');

  /** La tarjeta en curso respira un poco mas a los costados, como el bloque de arriba. */
  protected readonly margen = computed(() => (this.enCurso() ? 'px-5 lg:px-6' : 'px-4 lg:px-5'));

  /** El conductor no puede cancelar una reserva que ya arranco ni una que ya paso. */
  protected readonly cancelable = computed(
    () => reservaEnJuego(this.reserva()) && this.reserva().estado !== 'ACTIVA',
  );

  protected readonly vehiculo = computed(() => {
    const { marca, modelo, tipo } = this.reserva().vehiculo;
    const nombre = [marca, modelo].filter(Boolean).join(' ');
    return [nombre, ETIQUETA_TIPO_VEHICULO[tipo]].filter(Boolean).join(' · ');
  });

  protected readonly direccion = computed(() =>
    direccionCorta(this.reserva().estacionamiento.direccion),
  );

  protected readonly comoLlegar = computed(() =>
    linksComoLlegar(this.reserva().estacionamiento.direccion),
  );

  protected readonly cruzaMedianoche = computed(
    () => this.reserva().fechaHasta !== this.reserva().fecha,
  );

  /** "lun 28 sep". */
  protected readonly textoFecha = computed(() => {
    const { semana, numero, mes } = partesDeFecha(this.reserva().fecha);
    return `${semana} ${numero} ${mes}`;
  });
}
