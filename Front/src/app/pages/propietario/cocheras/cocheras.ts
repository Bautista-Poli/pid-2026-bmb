import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, Chip, EstadoVacio, Icono, Miniatura } from '@app/components/ui';
import { Cochera, direccionCorta, Estacionamiento, Id, ReservaDetallada } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { AltaCocheras } from './alta-cocheras/alta-cocheras';
import { EdicionMasiva } from './edicion-masiva/edicion-masiva';
import { FichaCochera } from './ficha-cochera/ficha-cochera';
import { CambioCocheras, agruparPorPlanta, nombresDePlantas } from './planta.interface';
import { PlanoCocheras } from './plano-cocheras/plano-cocheras';
import { ResumenCocheras } from './resumen-cocheras/resumen-cocheras';

/**
 * Pantalla `/propietario/cocheras` (y `/propietario/cocheras/:estacionamientoId`) · rol PROPIETARIO
 *
 * Plano de cocheras por planta (plano-cocheras). Arriba, un selector para pasar
 * entre los estacionamientos del propietario. Tocar una cochera abre su ficha al
 * costado (ficha-cochera; en mobile, una hoja desde abajo); con Shift / Ctrl /
 * Cmd se eligen varias y se editan juntas (edicion-masiva). El alta por cantidad
 * (alta-cocheras) vive en un modal.
 *
 * La pantalla solo carga los datos y junta las partes: que estacionamiento se
 * ve, sus cocheras, cuales estan elegidas y el aviso de la ultima accion. Cada
 * parte hace sus pedidos y avisa con `cambiada` / `creadas` para recargar.
 */
@Component({
  selector: 'app-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AltaCocheras,
    EdicionMasiva,
    FichaCochera,
    PlanoCocheras,
    ResumenCocheras,
    Boton,
    Cargando,
    Chip,
    EstadoVacio,
    Icono,
    Miniatura,
  ],
  templateUrl: './cocheras.html',
  styleUrls: ['./compartido.css', './cocheras.css'],
})
export class Cocheras {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Desde la ruta con id; sin id, la pantalla muestra el primer estacionamiento. */
  readonly estacionamientoId = input<Id>();

  protected readonly direccionCorta = direccionCorta;

  /* ---------------------------- estacionamientos ---------------------------- */

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  /** El estacionamiento que se muestra: el de la ruta, o el primero si no hay ninguno. */
  protected readonly idActivo = computed<Id | undefined>(
    () => this.estacionamientoId() ?? this.recursoEstacionamientos.value()[0]?.id,
  );

  /** Cambia de estacionamiento: la ruta con id recarga la pantalla con el nuevo. */
  protected irA(id: Id): void {
    void this.router.navigate(['/propietario/cocheras', id]);
  }

  /** Al cambiar de estacionamiento no arrastramos la seleccion, la planta ni el aviso. */
  private readonly alCambiarEstacionamiento = effect(() => {
    this.idActivo();
    untracked(() => {
      this.seleccion.set([]);
      this.planta.set(null);
      this.aviso.set(null);
    });
  });

  protected readonly recursoEstacionamiento = rxResource({
    params: () => this.idActivo(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.idActivo(),
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  /** Reservas del estacionamiento: la ficha saca de aca las proximas de su cochera. */
  protected readonly recursoReservas = rxResource({
    params: () => this.idActivo(),
    stream: ({ params }) => this.reservas.listarPorEstacionamiento(params),
    defaultValue: [] as ReservaDetallada[],
  });

  /* -------------------------------- plantas -------------------------------- */

  protected readonly plantas = computed(() => agruparPorPlanta(this.recursoCocheras.value()));
  protected readonly nombresPlantas = computed(() => nombresDePlantas(this.plantas()));

  /** Planta que muestra el plano (plano-cocheras/); `null` = la primera. */
  protected readonly planta = signal<string | null>(null);

  /* ------------------------------- seleccion ------------------------------- */

  /** Ids de las cocheras elegidas en el plano (plano-cocheras/). */
  protected readonly seleccion = signal<Id[]>([]);

  protected readonly elegidas = computed(() => {
    const ids = new Set(this.seleccion());
    return this.recursoCocheras.value().filter((c) => ids.has(c.id));
  });

  /** Con una sola elegida se abre su ficha; con varias, la edicion masiva. */
  protected readonly unica = computed(() => {
    const lista = this.elegidas();
    return lista.length === 1 ? lista[0] : null;
  });

  /** Al elegir otras cocheras, el aviso de la accion anterior deja de tener sentido. */
  protected elegir(ids: Id[]): void {
    this.aviso.set(null);
    this.seleccion.set(ids);
  }

  protected cerrarPanel(): void {
    this.seleccion.set([]);
  }

  /* ------------------------ alta por cantidad (modal) ---------------------- */

  protected readonly agregando = signal(false);
  /** Planta con la que arranca el alta ('' = nueva planta). */
  protected readonly plantaAlta = signal<string | null>(null);

  /** Sin planta pedida, arranca en la que se esta viendo. */
  protected abrirAlta(planta?: string): void {
    this.plantaAlta.set(planta ?? this.planta() ?? this.plantas()[0]?.nombre ?? null);
    this.agregando.set(true);
  }

  protected alCrear({ cantidad, planta }: { cantidad: number; planta: string }): void {
    this.agregando.set(false);
    this.alCambiar({
      aviso: cantidad === 1 ? 'Agregamos 1 cochera.' : `Agregamos ${cantidad} cocheras.`,
      planta,
    });
  }

  /* -------------------------------- comun ---------------------------------- */

  /** Resultado de la ultima accion, arriba del plano. */
  protected readonly aviso = signal<string | null>(null);

  /**
   * La ficha, la edicion masiva o el alta ya hicieron su pedido: se muestra el
   * aviso, el plano pasa a la planta tocada y se vuelven a pedir los datos.
   */
  protected alCambiar({ aviso, planta }: CambioCocheras): void {
    this.aviso.set(aviso ?? null);
    if (planta) this.planta.set(planta);
    this.recursoCocheras.reload();
    this.recursoReservas.reload();
  }
}
