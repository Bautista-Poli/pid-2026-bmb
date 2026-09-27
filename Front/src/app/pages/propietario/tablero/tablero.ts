import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CeldaCochera, LeyendaCocheras } from '@app/components/cochera';
import { FilaReserva } from '@app/components/reserva';
import { Boton, Cargando, Chip, EstadoVacio, Kpi, Tarjeta } from '@app/components/ui';
import {
  Cochera,
  Estacionamiento,
  EstadoCochera,
  ESTADOS_COCHERA_ORDEN,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  ReservaDetallada,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { avanzarReserva } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { aFechaISO } from '@app/utils/fecha.util';

/**
 * Pantalla `/propietario/tablero` · rol PROPIETARIO
 *
 * Panel de ocupacion y KPIs del dia. Es el inicio del propietario.
 */
@Component({
  selector: 'app-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    CeldaCochera,
    LeyendaCocheras,
    FilaReserva,
    Kpi,
    Tarjeta,
    Chip,
    Boton,
    Cargando,
    EstadoVacio,
  ],
  templateUrl: './tablero.html',
})
export class Tablero {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly estados = ESTADOS_COCHERA_ORDEN;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly seleccionadoId = signal<Id | null>(null);
  protected readonly cocheraAbierta = signal<Cochera | null>(null);

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  /** Estacionamiento activo: el elegido, o el primero que devuelve la API. */
  protected readonly activo = computed<Estacionamiento | null>(() => {
    const lista = this.recursoEstacionamientos.value();
    return lista.find((e) => e.id === this.seleccionadoId()) ?? lista[0] ?? null;
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.activo()?.id,
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  protected readonly recursoReservasHoy = rxResource({
    params: () => this.activo()?.id,
    stream: ({ params }) => this.reservas.listarPorEstacionamiento(params, aFechaISO(new Date())),
    defaultValue: [] as ReservaDetallada[],
  });

  /** KPIs del dia, derivados de las cocheras y las reservas ya cargadas. */
  protected readonly resumen = computed(() => {
    const reservas = this.recursoReservasHoy.value().filter((r) => r.estado !== 'CANCELADA');
    return {
      reservasHoy: reservas.length,
      cocherasLibres: this.recursoCocheras.value().filter((c) => c.estado === 'LIBRE').length,
      ingresos: reservas.reduce((total, r) => total + r.precioTotal, 0),
    };
  });

  /** Momento del ultimo refresco de la cuadricula ("Actualizado 9:38"). */
  protected readonly actualizadoEn = computed(() => {
    this.recursoCocheras.value();
    return new Date();
  });

  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly ingresos = computed(
    () => `$ ${this.resumen().ingresos.toLocaleString('es-AR')}`,
  );

  protected seleccionar(id: Id): void {
    this.seleccionadoId.set(id);
    this.cocheraAbierta.set(null);
  }

  protected abrir(cochera: Cochera): void {
    this.cocheraAbierta.update((actual) => (actual?.id === cochera.id ? null : cochera));
  }

  /** Ciclo de la reserva desde el panel: mismos pasos que "Reservas recibidas". */
  protected avanzar(reserva: ReservaDetallada): void {
    const paso = avanzarReserva(this.reservas, reserva);
    if (!paso) return;

    this.procesandoId.set(reserva.id);
    this.error.set(null);

    paso.llamada.subscribe({
      next: () => {
        this.procesandoId.set(null);
        // El ingreso y el egreso cambian el estado de la cochera.
        this.recursoReservasHoy.reload();
        this.recursoCocheras.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.error.set(e.message);
      },
    });
  }

  /** `PATCH /api/estacionamientos/:id/cocheras/:idCochera` y refresco de la cuadricula. */
  protected cambiarEstado(cochera: Cochera, estado: EstadoCochera): void {
    this.cocheras.cambiarEstado(cochera, estado).subscribe({
      next: () => {
        this.cocheraAbierta.set(null);
        this.recursoCocheras.reload();
      },
    });
  }
}
