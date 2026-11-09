import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CalificarConductor } from './calificar-conductor/calificar-conductor';
import { FiltrosReservas } from './filtros-reservas/filtros-reservas';
import { SeccionReservas } from './seccion-reservas/seccion-reservas';
import { Boton, Cargando, EstadoVacio, Modal } from '@app/components/ui';
import { EstadoReserva, Estacionamiento, Id, ReservaDetallada } from '@app/models';
import { avanzarReserva } from '@app/services/ciclo-reserva';
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

const sinAcentos = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pantalla `/propietario/reservas` · rol PROPIETARIO
 *
 * Todas las reservas de los estacionamientos del propietario, con pestañas por
 * estado, busqueda por patente / estacionamiento / vehiculo y filtro por fecha.
 */
@Component({
  selector: 'app-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FiltrosReservas, SeccionReservas, CalificarConductor, Cargando, EstadoVacio, Boton, Modal],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class Reservas {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly busqueda = signal('');
  protected readonly fecha = signal('');
  protected readonly estacionamientoId = signal<Id | ''>('');
  /** Las canceladas quedan ocultas hasta que el propietario las pide. */
  protected readonly verCanceladas = signal(false);

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

  /** Reservas que pasan la busqueda, la fecha y el estacionamiento (antes de la pestaña). */
  private readonly filtradas = computed(() => {
    const texto = sinAcentos(this.busqueda().trim());
    const fecha = this.fecha();
    const lote = this.estacionamientoId();

    return this.recurso
      .value()
      .filter((r) => this.verCanceladas() || r.estado !== 'CANCELADA')
      .filter((r) => !fecha || r.fecha === fecha)
      .filter((r) => !lote || r.estacionamientoId === lote)
      .filter((r) => {
        if (!texto) return true;
        const campos = [
          r.vehiculo.patente,
          r.vehiculo.marca ?? '',
          r.vehiculo.modelo ?? '',
          r.estacionamiento.nombre,
          r.cochera?.identificador ?? '',
        ];
        return campos.some((campo) => sinAcentos(campo).includes(texto));
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaDesde.localeCompare(b.horaDesde));
  });

  /** Cada seccion con sus reservas; las vacias no se muestran. */
  protected readonly secciones = computed(() => {
    const lista = this.filtradas();
    return SECCIONES.map((seccion) => ({
      ...seccion,
      reservas: lista.filter((r) => seccion.estados.includes(r.estado)),
    })).filter((seccion) => seccion.reservas.length > 0);
  });

  /** Reserva que se esta procesando: pinta el spinner en su fila. */
  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Confirmar una pendiente; ingreso y egreso solo con el codigo del conductor. */
  protected avanzar(reserva: ReservaDetallada): void {
    const paso = avanzarReserva(this.reservas, reserva);
    if (!paso) return;

    this.procesandoId.set(reserva.id);
    this.aviso.set(null);
    this.error.set(null);

    paso.llamada.subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.aviso.set(paso.aviso);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.error.set(e.message);
      },
    });
  }

  /* ------------------------ ausente a mano (no-show) ------------------------ */

  /** Reserva que se esta por marcar ausente: abre el modal de confirmacion. */
  protected readonly aMarcarAusente = signal<ReservaDetallada | null>(null);

  /** Marca la reserva como ausente (no-show) a mano y libera la cochera. */
  protected marcarAusente(reserva: ReservaDetallada): void {
    this.procesandoId.set(reserva.id);
    this.aviso.set(null);
    this.error.set(null);

    this.reservas.marcarAusente(reserva.id).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.aMarcarAusente.set(null);
        this.aviso.set(`Marcaste ausente a ${reserva.vehiculo.patente}. La cochera quedó libre.`);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.aMarcarAusente.set(null);
        this.error.set(e.message);
      },
    });
  }

  /* ----------------------- calificacion del conductor ----------------------- */

  /** Reserva cuyo conductor se esta calificando: abre el modal. */
  protected readonly aCalificar = signal<ReservaDetallada | null>(null);

  /** Cierra el modal, avisa y recarga la lista. */
  protected conductorCalificado(): void {
    const reserva = this.aCalificar();
    this.aCalificar.set(null);
    this.aviso.set(reserva ? `Calificaste al conductor de ${reserva.vehiculo.patente}.` : 'Calificaste al conductor.');
    this.recurso.reload();
  }
}
