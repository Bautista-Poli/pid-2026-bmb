import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FilaReserva } from '@app/components/reserva';
import { Cargando, Chip, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Estacionamiento, Id, ReservaDetallada } from '@app/models';
import { avanzarReserva } from '@app/services/ciclo-reserva';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';

/**
 * Pantalla `/propietario/reservas` · rol PROPIETARIO
 *
 * Reservas recibidas en los estacionamientos del propietario.
 */
@Component({
  selector: 'app-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilaReserva, Tarjeta, Chip, Cargando, EstadoVacio],
  templateUrl: './reservas.html',
})
export class Reservas {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly seleccionadoId = signal<Id | null>(null);

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly activo = computed<Estacionamiento | null>(() => {
    const lista = this.recursoEstacionamientos.value();
    return lista.find((e) => e.id === this.seleccionadoId()) ?? lista[0] ?? null;
  });

  protected readonly recurso = rxResource({
    params: () => this.activo()?.id,
    stream: ({ params }) => this.reservas.listarPorEstacionamiento(params),
    defaultValue: [] as ReservaDetallada[],
  });

  /** Reserva que se esta procesando: pinta el spinner en su fila. */
  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Confirmar, registrar ingreso o registrar egreso, segun el estado. */
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
}
