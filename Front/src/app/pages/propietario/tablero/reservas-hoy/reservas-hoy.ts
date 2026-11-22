import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfirmarReserva, EstadoReserva, ResultadoReserva } from '@app/components/reserva';
import { Icono, Tarjeta } from '@app/components/ui';
import { ETIQUETA_TIPO_VEHICULO, ICONO_TIPO_VEHICULO, ReservaDetallada } from '@app/models';
import { hoyISO } from '@app/utils/fecha.util';

/** Cuantas reservas muestra la lista; el resto se ve en Reservas. */
const MAXIMO = 6;

/**
 * Reservas de hoy en el tablero (tablero.ts): las primeras 6, por hora, con su
 * estado (incluye las canceladas).
 *
 * Se arregla solo: recibe las reservas tal como llegan y se queda con las de
 * hoy. Una pendiente se confirma desde aca con su boton (components/reserva);
 * a la pantalla le llega como termino (`confirmada`). Ingreso y egreso van
 * solo con el codigo.
 */
@Component({
  selector: 'app-reservas-hoy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ConfirmarReserva, EstadoReserva, Icono, Tarjeta],
  templateUrl: './reservas-hoy.html',
  styleUrls: ['../compartido.css', './reservas-hoy.css'],
  host: { style: 'display: contents' },
})
export class ReservasHoy {
  /** Todas las reservas del propietario. */
  readonly reservas = input.required<ReservaDetallada[]>();
  readonly cargando = input(false);

  /** Como termino la confirmacion de una pendiente: aviso o error. */
  readonly confirmada = output<ResultadoReserva>();

  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly iconoVehiculo = ICONO_TIPO_VEHICULO;

  private readonly deHoy = computed(() => {
    const hoy = hoyISO();
    return this.reservas()
      .filter((r) => r.fecha === hoy)
      .sort((a, b) => a.horaDesde.localeCompare(b.horaDesde));
  });

  protected readonly visibles = computed(() => this.deHoy().slice(0, MAXIMO));
  /** Las que no entran en la lista: "Ver N más". */
  protected readonly restantes = computed(() => Math.max(0, this.deHoy().length - MAXIMO));
}
