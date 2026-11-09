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
import { Observable, forkJoin } from 'rxjs';
import { Boton, Cargando, Chip, EstadoVacio, Icono, Miniatura, Modal } from '@app/components/ui';
import { Cochera, direccionCorta, Estacionamiento, Id, NuevaCochera, ReservaDetallada } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { aInstante } from '@app/utils/fecha.util';
import { AltaCocheras } from './alta-cocheras/alta-cocheras';
import { BloqueoCochera } from './bloqueo-cochera/bloqueo-cochera';
import { Planta, SIN_PLANTA } from './constantes';
import { EdicionMasiva } from './edicion-masiva/edicion-masiva';
import { FichaCochera } from './ficha-cochera/ficha-cochera';
import { PlanoCocheras } from './plano-cocheras/plano-cocheras';
import { ResumenCocheras } from './resumen-cocheras/resumen-cocheras';

interface Confirmacion {
  titulo: string;
  texto: string;
  boton: string;
  accion: () => void;
}

/**
 * Pantalla `/propietario/cocheras` (y `/propietario/cocheras/:estacionamientoId`) · rol PROPIETARIO
 *
 * Plano de cocheras por planta (plano-cocheras). Arriba, un selector para pasar
 * entre los estacionamientos del propietario. Tocar una cochera abre su ficha al
 * costado (ficha-cochera; en mobile, una hoja desde abajo); con Shift / Ctrl /
 * Cmd se eligen varias y se editan juntas (edicion-masiva). El alta por cantidad
 * (alta-cocheras) y el bloqueo (bloqueo-cochera) viven en modales.
 */
@Component({
  selector: 'app-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AltaCocheras,
    BloqueoCochera,
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
    Modal,
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

  /** Al cambiar de estacionamiento no arrastramos la seleccion ni los formularios. */
  private readonly alCambiarEstacionamiento = effect(() => {
    this.idActivo();
    untracked(() => {
      this.seleccion.set([]);
      this.plantaElegida.set(null);
      this.aviso.set(null);
      this.error.set(null);
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

  /** Reservas del estacionamiento, para las "proximas reservas" de cada cochera. */
  protected readonly recursoReservas = rxResource({
    params: () => this.idActivo(),
    stream: ({ params }) => this.reservas.listarPorEstacionamiento(params),
    defaultValue: [] as ReservaDetallada[],
  });

  /* -------------------------------- plantas -------------------------------- */

  /** Cocheras agrupadas por planta (la columna `sector`), en el orden en que aparecen. */
  protected readonly plantas = computed<Planta[]>(() => {
    const porPlanta = new Map<string, Cochera[]>();
    for (const cochera of this.recursoCocheras.value()) {
      const nombre = cochera.sector?.trim() || SIN_PLANTA;
      porPlanta.set(nombre, [...(porPlanta.get(nombre) ?? []), cochera]);
    }
    return [...porPlanta].map(([nombre, cocheras]) => ({ nombre, cocheras }));
  });

  /** Para el `<datalist>` de plantas que usan la ficha y la edicion masiva. */
  protected readonly nombresPlantas = computed(() =>
    this.plantas()
      .map((p) => p.nombre)
      .filter((nombre) => nombre !== SIN_PLANTA),
  );

  protected readonly plantaElegida = signal<string | null>(null);

  protected readonly plantaActiva = computed<Planta | null>(() => {
    const lista = this.plantas();
    return lista.find((p) => p.nombre === this.plantaElegida()) ?? lista[0] ?? null;
  });

  protected verPlanta(nombre: string): void {
    this.plantaElegida.set(nombre);
  }

  /* ------------------------------- seleccion ------------------------------- */

  protected readonly seleccion = signal<Id[]>([]);

  protected readonly elegidas = computed(() => {
    const ids = new Set(this.seleccion());
    return this.recursoCocheras.value().filter((c) => ids.has(c.id));
  });

  protected readonly unica = computed(() => {
    const lista = this.elegidas();
    return lista.length === 1 ? lista[0] : null;
  });

  /** Clic: elige solo esa (o la suelta). Shift / Ctrl / Cmd: la suma o la saca. */
  protected tocar(cochera: Cochera, evento: MouseEvent): void {
    this.error.set(null);
    this.aviso.set(null);

    if (evento.shiftKey || evento.metaKey || evento.ctrlKey) {
      this.seleccion.update((ids) =>
        ids.includes(cochera.id) ? ids.filter((id) => id !== cochera.id) : [...ids, cochera.id],
      );
    } else if (this.seleccion().length === 1 && this.seleccion()[0] === cochera.id) {
      this.seleccion.set([]);
    } else {
      this.seleccion.set([cochera.id]);
    }
  }

  /** Selecciona todas las cocheras activas de la planta. */
  protected elegirTodaLaPlanta(): void {
    const planta = this.plantaActiva();
    if (!planta) return;
    this.seleccion.set(planta.cocheras.filter((c) => c.estado !== 'INACTIVA').map((c) => c.id));
  }

  protected cerrarPanel(): void {
    this.seleccion.set([]);
  }

  /* ------------------------------ edicion -------------------------------- */

  /** Las proximas 3 reservas vigentes de la cochera abierta. */
  protected readonly proximas = computed(() => {
    const cochera = this.unica();
    if (!cochera) return [];
    return this.recursoReservas
      .value()
      .filter((r) => r.cocheraId === cochera.id && reservaEnJuego(r))
      .sort((a, b) =>
        aInstante(a.fecha, a.horaDesde).localeCompare(aInstante(b.fecha, b.horaDesde)),
      )
      .slice(0, 3);
  });

  /** Guarda los cambios de la ficha de una cochera. */
  protected guardar(cochera: Cochera, cambios: Partial<NuevaCochera>): void {
    this.ejecutar([this.cocheras.actualizar(cochera, cambios)], (guardadas) => {
      const guardada = guardadas[0] as Cochera;
      if (cambios.sector) this.plantaElegida.set(cambios.sector);
      return `Guardamos los cambios de la cochera ${guardada.identificador}.`;
    });
  }

  /** Aplica los cambios de la edicion masiva a todas las elegidas activas. */
  protected aplicarMasivo(cambios: Partial<NuevaCochera>): void {
    const lista = this.elegidas().filter((c) => c.estado !== 'INACTIVA');
    if (lista.length === 0) return;

    this.ejecutar(
      lista.map((c) => this.cocheras.actualizar(c, cambios)),
      () => {
        if (cambios.sector) this.plantaElegida.set(cambios.sector);
        return `Actualizamos ${lista.length} cocheras.`;
      },
    );
  }

  /* ------------------------------ baja y alta ------------------------------ */

  protected readonly confirmacion = signal<Confirmacion | null>(null);

  protected confirmar(): void {
    const pedido = this.confirmacion();
    this.confirmacion.set(null);
    pedido?.accion();
  }

  /** Pide confirmacion y da de baja la cochera (cancela sus reservas vigentes). */
  protected pedirBaja(): void {
    const lista = this.elegidas().filter((c) => c.estado !== 'INACTIVA');
    if (lista.length === 0) return;

    const nombre = lista.length === 1 ? `la cochera ${lista[0].identificador}` : `${lista.length} cocheras`;
    this.confirmacion.set({
      titulo: lista.length === 1 ? `Dar de baja ${lista[0].identificador}` : `Dar de baja ${lista.length} cocheras`,
      texto: `Vas a dar de baja ${nombre}. No se van a poder reservar y se cancelan sus reservas vigentes. Podés reactivarlas después.`,
      boton: 'Dar de baja',
      accion: () =>
        this.ejecutar(lista.map((c) => this.cocheras.darDeBaja(c)), () => {
          this.seleccion.set([]);
          return lista.length === 1
            ? `La cochera ${lista[0].identificador} quedó dada de baja.`
            : `Dimos de baja ${lista.length} cocheras.`;
        }),
    });
  }

  /** Reactiva una cochera dada de baja. */
  protected reactivar(cochera: Cochera): void {
    this.ejecutar(
      [this.cocheras.reactivar(cochera)],
      () => `La cochera ${cochera.identificador} volvió a estar activa.`,
    );
  }

  /* ------------------------------- bloqueo ---------------------------------- */

  /** Cochera para la que esta abierto el modal de bloqueo, o null si esta cerrado. */
  protected readonly bloqueando = signal<Cochera | null>(null);

  protected alBloquear(mensaje: string): void {
    this.bloqueando.set(null);
    this.seleccion.set([]);
    this.aviso.set(mensaje);
    this.recursoCocheras.reload();
    this.recursoReservas.reload();
  }

  /** Saca el bloqueo de la cochera. */
  protected desbloquear(cochera: Cochera): void {
    this.ejecutar(
      [this.cocheras.desbloquear(cochera)],
      () => `La cochera ${cochera.identificador} quedó desbloqueada.`,
    );
  }

  /** Pide confirmacion y borra la cochera (solo si nunca tuvo reservas). */
  protected pedirEliminacion(cochera: Cochera): void {
    this.confirmacion.set({
      titulo: `Eliminar ${cochera.identificador}`,
      texto:
        'Se borra definitivamente y no se puede deshacer. Solo es posible si la cochera nunca tuvo reservas.',
      boton: 'Eliminar',
      accion: () =>
        this.ejecutar([this.cocheras.eliminar(cochera)], () => {
          this.seleccion.set([]);
          return `La cochera ${cochera.identificador} fue eliminada.`;
        }),
    });
  }

  /* ------------------------ alta por cantidad (modal) ---------------------- */

  protected readonly agregando = signal(false);
  /** Planta con la que arranca el alta ('' = nueva planta). */
  protected readonly plantaAlta = signal<string | null>(null);

  protected abrirAlta(planta?: string): void {
    this.plantaAlta.set(planta ?? this.plantaActiva()?.nombre ?? null);
    this.agregando.set(true);
  }

  protected alCrear({ cantidad, planta }: { cantidad: number; planta: string }): void {
    this.agregando.set(false);
    this.plantaElegida.set(planta);
    this.aviso.set(cantidad === 1 ? 'Agregamos 1 cochera.' : `Agregamos ${cantidad} cocheras.`);
    this.recursoCocheras.reload();
  }

  /* -------------------------------- comun ---------------------------------- */

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Corre uno o varios pedidos juntos, avisa y refresca el plano. */
  private ejecutar(pedidos: Observable<unknown>[], alTerminar: (respuestas: unknown[]) => string): void {
    this.enviando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    forkJoin(pedidos).subscribe({
      next: (respuestas) => {
        this.enviando.set(false);
        this.aviso.set(alTerminar(respuestas));
        this.recursoCocheras.reload();
        this.recursoReservas.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
        this.recursoCocheras.reload();
      },
    });
  }
}
