import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CalificarConductor } from './calificar-conductor/calificar-conductor';
import { FiltroReservas, FiltrosReservas, SIN_FILTRO, filtrarReservas } from './filtros-reservas/filtros-reservas';
import { MarcarAusente } from './marcar-ausente/marcar-ausente';
import { SeccionReservas } from './seccion-reservas/seccion-reservas';
import { ResultadoReserva } from '@app/components/reserva';
import { Cargando, EstadoVacio } from '@app/components/ui';
import { EstadoReserva, Estacionamiento, ReservaDetallada } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';

/**
 * Secciones en el orden en que se muestran, una debajo de la otra: nunca una
 * lista mezclada. Las canceladas van al final y se ocultan hasta pedirlas.
 */
const SECCIONES: { clave: string; titulo: string; estados: EstadoReserva[] }[] = [
  { clave: 'ACTIVAS', titulo: 'Activas', estados: ['CONFIRMADA', 'ACTIVA'] },
  { clave: 'PENDIENTES', titulo: 'Pendientes', estados: ['PENDIENTE'] },
  { clave: 'FINALIZADAS', titulo: 'Finalizadas', estados: ['FINALIZADA'] },
  { clave: 'NO_SHOW', titulo: 'Ausentes', estados: ['NO_SHOW'] },
  { clave: 'CANCELADAS', titulo: 'Canceladas y expiradas', estados: ['CANCELADA'] },
];

/**
 * Pantalla `/propietario/reservas` · rol PROPIETARIO
 *
 * Todas las reservas de los estacionamientos del propietario, separadas en
 * secciones por estado, con busqueda por patente / estacionamiento / vehiculo
 * y filtro por fecha.
 *
 * La pantalla carga las reservas, las reparte en secciones y muestra el aviso
 * de la ultima accion. Confirmar, marcar ausente y calificar los hace cada
 * parte y avisan para recargar.
 */
@Component({
  selector: 'app-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FiltrosReservas, SeccionReservas, CalificarConductor, MarcarAusente, Cargando, EstadoVacio],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class Reservas {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  /** Lo elegido en los filtros (filtros-reservas/). */
  protected readonly filtro = signal<FiltroReservas>(SIN_FILTRO);

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly recurso = rxResource({
    params: () => ({ ids: this.recursoEstacionamientos.value().map((e) => e.id) }),
    stream: ({ params }) => this.reservas.listarDeEstacionamientos(params.ids),
    defaultValue: [] as ReservaDetallada[],
  });

  /** Cada seccion con las reservas que pasan el filtro; las vacias no se muestran. */
  protected readonly secciones = computed(() => {
    const lista = filtrarReservas(this.recurso.value(), this.filtro());
    return SECCIONES.map((seccion) => ({
      ...seccion,
      reservas: lista.filter((r) => seccion.estados.includes(r.estado)),
    })).filter((seccion) => seccion.reservas.length > 0);
  });

  /* ------------------------- resultado de las acciones ------------------------ */

  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Una parte ya hizo su pedido: se muestra como termino y se recarga la lista. */
  protected alTerminar(resultado: ResultadoReserva): void {
    this.aviso.set('aviso' in resultado ? resultado.aviso : null);
    this.error.set('error' in resultado ? resultado.error : null);
    this.recurso.reload();
  }

  /** Reserva que se esta por marcar ausente: abre su modal (marcar-ausente/). */
  protected readonly aMarcarAusente = signal<ReservaDetallada | null>(null);

  protected ausenteMarcado(): void {
    const reserva = this.aMarcarAusente();
    this.aMarcarAusente.set(null);
    this.alTerminar({
      aviso: reserva
        ? `Marcaste ausente a ${reserva.vehiculo.patente}. La cochera quedó libre.`
        : 'Marcaste ausente la reserva.',
    });
  }

  /** Reserva cuyo conductor se esta calificando: abre su modal (calificar-conductor/). */
  protected readonly aCalificar = signal<ReservaDetallada | null>(null);

  protected conductorCalificado(): void {
    const reserva = this.aCalificar();
    this.aCalificar.set(null);
    this.alTerminar({
      aviso: reserva ? `Calificaste al conductor de ${reserva.vehiculo.patente}.` : 'Calificaste al conductor.',
    });
  }
}
