import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EstadoCocheras } from './estado-cocheras/estado-cocheras';
import { IngresarCodigo } from './ingresar-codigo/ingresar-codigo';
import { OcupacionSemana } from './ocupacion-semana/ocupacion-semana';
import { ReservasHoy } from './reservas-hoy/reservas-hoy';
import { ResumenHoy } from './resumen-hoy/resumen-hoy';
import { ResultadoReserva } from '@app/components/reserva';
import { Boton, Cargando, EstadoVacio, Icono } from '@app/components/ui';
import { Cochera, Estacionamiento, Id, ReservaDetallada } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';

/**
 * Pantalla `/propietario/tablero` · rol PROPIETARIO
 *
 * Inicio del propietario: metricas del dia de todos sus estacionamientos,
 * ocupacion de la semana, reservas de hoy y el estado de cada cochera.
 *
 * La pantalla solo carga los datos (estacionamientos, reservas y las cocheras
 * del estacionamiento elegido) y se los pasa a cada parte tal como llegan:
 * cada una calcula lo que muestra.
 */
@Component({
  selector: 'app-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    ResumenHoy,
    OcupacionSemana,
    ReservasHoy,
    EstadoCocheras,
    IngresarCodigo,
    Boton,
    Cargando,
    EstadoVacio,
    Icono,
  ],
  templateUrl: './tablero.html',
  styleUrls: ['./compartido.css', './tablero.css'],
})
export class Tablero {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly hoy = new Date();

  protected readonly nombre = computed(() => this.auth.usuario()?.nombre ?? '');

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  /** Todas las reservas de todos los estacionamientos: de aca salen metricas, grafico y lista de hoy. */
  protected readonly recursoReservas = rxResource({
    params: () => ({ ids: this.recursoEstacionamientos.value().map((e) => e.id) }),
    stream: ({ params }) => this.reservas.listarDeEstacionamientos(params.ids),
    defaultValue: [] as ReservaDetallada[],
  });

  /* --------------------------- estado de cocheras -------------------------- */

  /** Estacionamiento elegido en "Estado de cocheras" (estado-cocheras/). */
  protected readonly seleccionadoId = signal<Id | null>(null);

  /** Estacionamiento de la cuadricula: el elegido, o el primero. */
  protected readonly activo = computed<Estacionamiento | null>(() => {
    const lista = this.recursoEstacionamientos.value();
    return lista.find((e) => e.id === this.seleccionadoId()) ?? lista[0] ?? null;
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.activo()?.id,
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  /* ------------------------------ reservas de hoy --------------------------- */

  protected readonly error = signal<string | null>(null);

  /** Se confirmo (o no) una pendiente desde "Reservas de hoy": cambia todo el tablero. */
  protected alConfirmar(resultado: ResultadoReserva): void {
    this.error.set('error' in resultado ? resultado.error : null);
    if ('error' in resultado) return;
    this.recursoReservas.reload();
    this.recursoCocheras.reload();
    this.recursoEstacionamientos.reload();
  }
}
