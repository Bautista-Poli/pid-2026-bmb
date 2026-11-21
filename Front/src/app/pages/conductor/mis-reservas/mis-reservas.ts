import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { HistorialReservas, sinUsar } from './historial-reservas/historial-reservas';
import { Pestania, PestaniasReservas } from './menu-pestanias/pestanias-reservas';
import { ReservasVigentes } from './reservas-vigentes/reservas-vigentes';
import { Boton, Cargando, EstadoVacio } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { ReservaService } from '@app/services/reserva.service';
import { aInstante } from '@app/utils/fecha.util';

const inicioDe = (reserva: ReservaDetallada) =>
  Date.parse(aInstante(reserva.fecha, reserva.horaDesde));

/**
 * Pantalla `/conductor/mis-reservas` · rol CONDUCTOR
 *
 * Carga las reservas del conductor y las reparte entre las dos pestañas:
 * Vigentes (reservas-vigentes) e Historial (historial-reservas).
 */
@Component({
  selector: 'app-mis-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PestaniasReservas,
    ReservasVigentes,
    HistorialReservas,
    Cargando,
    EstadoVacio,
    Boton,
    RouterLink,
  ],
  templateUrl: './mis-reservas.html',
  styleUrl: './mis-reservas.css',
})
export class MisReservas {
  private readonly reservas = inject(ReservaService);

  protected readonly pestania = signal<Pestania>('VIGENTES');

  /** Confirmacion visible: la reserva cancelada se va a Historial. */
  protected readonly aviso = signal<string | null>(null);

  protected readonly recurso = rxResource({
    stream: () => this.reservas.listarMisReservas(),
    defaultValue: [] as ReservaDetallada[],
  });

  protected readonly vigentes = computed(() =>
    this.recurso
      .value()
      .filter(reservaEnJuego)
      .sort((a, b) => inicioDe(a) - inicioDe(b)),
  );

  protected readonly pasadas = computed(() =>
    this.recurso
      .value()
      .filter((reserva) => !reservaEnJuego(reserva))
      .sort((a, b) => inicioDe(b) - inicioDe(a)),
  );

  /** La mas reciente que todavia puede calificar (entro y salio hace menos de 7 dias). */
  protected readonly porCalificar = computed(() => this.pasadas().find((reserva) => reserva.calificable) ?? null);

  /**
   * Si el historial muestra tambien las canceladas, expiradas y ausentes. Vive
   * aca y no en la pestaña porque cambia el contador de "Historial".
   */
  protected readonly mostrarSinUsar = signal(false);

  protected readonly cantidadVigentes = computed(() => this.vigentes().length);
  protected readonly cantidadHistorial = computed(() =>
    this.mostrarSinUsar()
      ? this.pasadas().length
      : this.pasadas().filter((reserva) => !sinUsar(reserva)).length,
  );

  protected cambiarPestania(pestania: Pestania): void {
    this.pestania.set(pestania);
    // Los avisos son de la pestaña anterior: al cambiar dejan de tener sentido.
    this.aviso.set(null);
  }

  /** La reserva pasa a CANCELADA: sale de Vigentes y aparece en Historial. */
  protected alCancelar(reserva: ReservaDetallada): void {
    this.aviso.set(`Cancelamos tu reserva en ${reserva.estacionamiento.nombre}.`);
    this.recurso.reload();
  }
}
