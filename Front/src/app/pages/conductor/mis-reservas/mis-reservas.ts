import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { HistorialReservas } from './historial-reservas/historial-reservas';
import { Pestania, PestaniasReservas } from './menu-pestanias/pestanias-reservas';
import { ReservasEnCurso } from './reservas-en-curso/reservas-en-curso';
import { ReservasProximas } from './reservas-proximas/reservas-proximas';
import { Boton, Cargando, EstadoVacio } from '@app/components/ui';
import { ReservaDetallada, reservaSinUsar } from '@app/models';
import { inicioDe, reservaEnJuego } from '@app/services/ciclo-reserva';
import { ReservaService } from '@app/services/reserva.service';

/**
 * Pantalla `/conductor/mis-reservas` · rol CONDUCTOR
 *
 * Carga las reservas del conductor y las reparte entre las tres pestañas:
 * Próximas (reservas-proximas), En curso (reservas-en-curso) e Historial
 * (historial-reservas).
 */
@Component({
  selector: 'app-mis-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PestaniasReservas,
    ReservasProximas,
    ReservasEnCurso,
    HistorialReservas,
    Cargando,
    EstadoVacio,
    Boton,
  ],
  templateUrl: './mis-reservas.html',
  styleUrl: './mis-reservas.css',
})
export class MisReservas {
  private readonly reservas = inject(ReservaService);

  /** Pestaña que eligio el conductor; `null` hasta que toca alguna. */
  private readonly pestaniaElegida = signal<Pestania | null>(null);

  /** Sin elegir, arranca en "En curso" si tiene una reserva en curso; si no, en "Próximas". */
  protected readonly pestania = computed<Pestania>(
    () => this.pestaniaElegida() ?? (this.enCurso().length > 0 ? 'EN_CURSO' : 'PROXIMAS'),
  );

  /** Confirmacion visible: la reserva cancelada se va a Historial. */
  protected readonly aviso = signal<string | null>(null);

  protected readonly recurso = rxResource({
    stream: () => this.reservas.listarMisReservas(),
    defaultValue: [] as ReservaDetallada[],
  });

  /** Las que siguen en juego (proximas y en curso), de la mas cercana a la mas lejana. */
  private readonly vigentes = computed(() =>
    this.recurso
      .value()
      .filter(reservaEnJuego)
      .sort((a, b) => inicioDe(a) - inicioDe(b)),
  );

  /** Ya ingreso al estacionamiento. */
  protected readonly enCurso = computed(() => this.vigentes().filter((reserva) => reserva.estado === 'ACTIVA'));
  /** Pendientes o confirmadas, todavia sin ingreso. */
  protected readonly proximas = computed(() => this.vigentes().filter((reserva) => reserva.estado !== 'ACTIVA'));

  protected readonly pasadas = computed(() =>
    this.recurso
      .value()
      .filter((reserva) => !reservaEnJuego(reserva))
      .sort((a, b) => inicioDe(b) - inicioDe(a)),
  );

  /**
   * Si el historial muestra tambien las canceladas, expiradas y ausentes. Vive
   * aca y no en la pestaña porque cambia el contador de "Historial".
   */
  protected readonly mostrarSinUsar = signal(false);

  /** El contador de cada pestaña. */
  protected readonly cantidades = computed<Record<Pestania, number>>(() => ({
    PROXIMAS: this.proximas().length,
    EN_CURSO: this.enCurso().length,
    HISTORIAL: this.mostrarSinUsar()
      ? this.pasadas().length
      : this.pasadas().filter((reserva) => !reservaSinUsar(reserva)).length,
  }));

  protected cambiarPestania(pestania: Pestania): void {
    this.pestaniaElegida.set(pestania);
    // Los avisos son de la pestaña anterior: al cambiar dejan de tener sentido.
    this.aviso.set(null);
  }

  /** La reserva pasa a CANCELADA: sale de Próximas y aparece en Historial. */
  protected alCancelar(reserva: ReservaDetallada): void {
    this.aviso.set(`Cancelamos tu reserva en ${reserva.estacionamiento.nombre}.`);
    this.recurso.reload();
  }
}
