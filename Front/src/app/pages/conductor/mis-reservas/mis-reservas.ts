import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AbrirReclamo, ObjetoReclamo } from '@app/components/reclamo';
import { QrReserva, TarjetaReserva } from '@app/components/reserva';
import { Boton, Cargando, Chip, EstadoVacio, Modal, Tarjeta } from '@app/components/ui';
import { Id, ReservaDetallada } from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { ReservaService } from '@app/services/reserva.service';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';

type Pestania = 'VIGENTES' | 'HISTORIAL';

interface MesHistorial {
  clave: string;
  titulo: string;
  reservas: ReservaDetallada[];
}

const MES_Y_ANIO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

const inicioDe = (reserva: ReservaDetallada) =>
  Date.parse(aInstante(reserva.fecha, reserva.horaDesde));

/**
 * Pantalla `/conductor/mis-reservas` · rol CONDUCTOR
 *
 * Vigentes: la reserva en curso arriba, con su reloj, y despues las proximas
 * de la mas cercana a la mas lejana. Historial: agrupado por mes, lo mas
 * reciente primero.
 */
@Component({
  selector: 'app-mis-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaReserva, QrReserva, AbrirReclamo, Tarjeta, Chip, Cargando, EstadoVacio, Boton, Modal, RouterLink, DatePipe],
  templateUrl: './mis-reservas.html',
})
export class MisReservas {
  private readonly reservas = inject(ReservaService);
  private readonly router = inject(Router);

  protected readonly pestania = signal<Pestania>('VIGENTES');

  protected readonly desdeFechaISO = desdeFechaISO;

  /** Reserva que el conductor quiere cancelar: mientras no sea null, el modal esta abierto. */
  protected readonly aCancelar = signal<ReservaDetallada | null>(null);
  /** Reserva que se esta cancelando: pinta el spinner en su tarjeta y en el modal. */
  protected readonly cancelandoId = signal<Id | null>(null);
  /** Error del ultimo intento, se muestra adentro del modal para poder reintentar. */
  protected readonly errorCancelar = signal<string | null>(null);
  /** Confirmacion visible: la reserva cancelada se va a Historial. */
  protected readonly aviso = signal<string | null>(null);
  /** Reserva cuyo QR se esta mostrando: mientras no sea null, el modal esta abierto. */
  protected readonly conQrAbierto = signal<ReservaDetallada | null>(null);
  /** Reserva sobre la que el conductor abre un reclamo: mientras no sea null, el modal esta abierto. */
  protected readonly aReclamar = signal<ObjetoReclamo | null>(null);

  protected pedirReclamo(reserva: ReservaDetallada): void {
    this.aReclamar.set({
      tipo: 'reserva',
      id: reserva.id,
      descripcion: `${reserva.estacionamiento.nombre} · ${reserva.fecha.split('-').reverse().join('/')} ${reserva.horaDesde}`,
      tope: Math.max(0, reserva.precioTotal - reserva.devuelto),
    });
  }

  /** Abierto el reclamo, se sigue en su hilo. */
  protected verReclamo(id: Id): void {
    this.aReclamar.set(null);
    this.router.navigate(['/conductor/incidencias'], { queryParams: { id } });
  }

  protected readonly recurso = rxResource({
    stream: () => this.reservas.listarMisReservas(),
    defaultValue: [] as ReservaDetallada[],
  });

  private readonly vigentes = computed(() =>
    this.recurso
      .value()
      .filter(reservaEnJuego)
      .sort((a, b) => inicioDe(a) - inicioDe(b)),
  );

  private readonly pasadas = computed(() =>
    this.recurso
      .value()
      .filter((reserva) => !reservaEnJuego(reserva))
      .sort((a, b) => inicioDe(b) - inicioDe(a)),
  );

  protected readonly cantidadVigentes = computed(() => this.vigentes().length);
  protected readonly cantidadHistorial = computed(() => this.pasadas().length);

  protected readonly enCurso = computed(() =>
    this.vigentes().filter((reserva) => reserva.estado === 'ACTIVA'),
  );
  protected readonly proximas = computed(() =>
    this.vigentes().filter((reserva) => reserva.estado !== 'ACTIVA'),
  );

  protected readonly historial = computed<MesHistorial[]>(() => {
    const meses: MesHistorial[] = [];
    for (const reserva of this.pasadas()) {
      const clave = reserva.fecha.slice(0, 7);
      let mes = meses.at(-1);
      if (mes?.clave !== clave) {
        const [anio, numero] = clave.split('-').map(Number);
        mes = { clave, titulo: MES_Y_ANIO.format(new Date(anio, numero - 1, 1)), reservas: [] };
        meses.push(mes);
      }
      mes.reservas.push(reserva);
    }
    return meses;
  });

  protected readonly vacia = computed(() =>
    this.pestania() === 'VIGENTES' ? this.cantidadVigentes() === 0 : this.cantidadHistorial() === 0,
  );

  protected cambiarPestania(pestania: Pestania): void {
    this.pestania.set(pestania);
    // Los avisos son de la pestaña anterior: al cambiar dejan de tener sentido.
    this.aviso.set(null);
  }

  protected pedirCancelacion(reserva: ReservaDetallada): void {
    this.errorCancelar.set(null);
    this.aCancelar.set(reserva);
  }

  protected cerrarCancelacion(): void {
    // Mientras viaja el PATCH el modal queda abierto: si falla, el error se ve ahi.
    if (this.cancelandoId()) return;
    this.aCancelar.set(null);
  }

  /** `PATCH /api/reservas/:id/cancelar` */
  protected confirmarCancelacion(): void {
    const reserva = this.aCancelar();
    if (!reserva) return;

    this.cancelandoId.set(reserva.id);
    this.aviso.set(null);
    this.errorCancelar.set(null);

    this.reservas.cancelar(reserva.id).subscribe({
      next: () => {
        this.cancelandoId.set(null);
        this.aCancelar.set(null);
        // La reserva pasa a CANCELADA: sale de Vigentes y aparece en Historial.
        this.aviso.set(`Cancelamos tu reserva en ${reserva.estacionamiento.nombre}.`);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.cancelandoId.set(null);
        this.errorCancelar.set(e.message);
      },
    });
  }
}
