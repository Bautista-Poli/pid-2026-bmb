import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { Boton, Confirmar, Icono } from '@app/components/ui';
import {
  Cochera,
  ETIQUETA_TIPO_VEHICULO,
  ICONO_TIPO_VEHICULO,
  NuevaCochera,
  TIPOS_VEHICULO,
  TipoVehiculo,
  cocheraActiva,
} from '@app/models';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { CambioCocheras } from '../planta.interface';

const cuantas = (cantidad: number) => (cantidad === 1 ? '1 cochera' : `${cantidad} cocheras`);

/**
 * Panel lateral de Cocheras (cocheras.ts) cuando hay varias elegidas: tipo,
 * techo y planta para todas juntas. Solo se cambia lo que se toca; lo demas
 * queda como esta.
 *
 * Se arregla solo: aplica los cambios y da de baja (con su confirmacion y su
 * error) sobre las elegidas que estan activas. A quien lo usa solo le avisa que
 * algo cambio, para que recargue, y que se quiere cerrar:
 *
 *   <app-edicion-masiva [elegidas]="elegidas()" (cambiada)="alCambiar($event)" (cerrar)="cerrarPanel()" />
 */
@Component({
  selector: 'app-edicion-masiva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Confirmar, Icono],
  templateUrl: './edicion-masiva.html',
  styleUrls: ['../compartido.css', './edicion-masiva.css'],
  host: { style: 'display: contents' },
})
export class EdicionMasiva {
  private readonly cocheras = inject(CocheraService);

  readonly elegidas = input.required<Cochera[]>();
  /** Nombres de las plantas cargadas, para sugerirlas al escribir. */
  readonly plantas = input<string[]>([]);

  readonly cerrar = output<void>();
  /** Ya se hizo el pedido: la pantalla recarga las cocheras y muestra el aviso. */
  readonly cambiada = output<CambioCocheras>();

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Si esta abierto el modal que confirma la baja. */
  protected readonly confirmandoBaja = signal(false);

  /** Las dadas de baja no se editan ni se vuelven a dar de baja. */
  protected readonly activas = computed(() => this.elegidas().filter(cocheraActiva));
  protected readonly textoActivas = computed(() => cuantas(this.activas().length));

  protected readonly tipos = TIPOS_VEHICULO;
  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;

  protected readonly masivoTipo = signal<TipoVehiculo | null>(null);
  protected readonly masivoCubierta = signal<boolean | null>(null);
  protected readonly masivoPlanta = signal('');

  protected readonly hayCambiosMasivos = computed(
    () =>
      this.masivoTipo() !== null ||
      this.masivoCubierta() !== null ||
      this.masivoPlanta().trim() !== '',
  );

  /** Al cambiar la seleccion (o despues de aplicar) se arranca de cero. */
  private readonly alCambiarSeleccion = effect(() => {
    this.elegidas();
    untracked(() => {
      this.masivoTipo.set(null);
      this.masivoCubierta.set(null);
      this.masivoPlanta.set('');
    });
  });

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  /** Aplica lo elegido a todas las activas; si se movieron de planta, el plano pasa a mostrarla. */
  protected aplicarCambios(): void {
    const activas = this.activas();
    if (!this.hayCambiosMasivos() || activas.length === 0) return;
    const cambios: Partial<NuevaCochera> = {};
    const tipo = this.masivoTipo();
    const cubierta = this.masivoCubierta();
    const planta = this.masivoPlanta().trim();
    if (tipo) cambios.tipoVehiculo = tipo;
    if (cubierta !== null) cambios.cubierta = cubierta;
    if (planta) cambios.sector = planta;
    this.ejecutar(
      activas.map((c) => this.cocheras.actualizar(c, cambios)),
      { aviso: `Actualizamos ${cuantas(activas.length)}.`, planta: cambios.sector },
    );
  }

  /** Ya confirmada: da de baja las activas (cancela sus reservas vigentes) y suelta la seleccion. */
  protected darDeBaja(): void {
    const activas = this.activas();
    this.confirmandoBaja.set(false);
    if (activas.length === 0) return;
    this.ejecutar(
      activas.map((c) => this.cocheras.darDeBaja(c)),
      { aviso: `Dimos de baja ${cuantas(activas.length)}.` },
      true,
    );
  }

  /**
   * Corre los pedidos juntos y avisa a la pantalla. Si alguno falla, el error
   * queda en el panel y se avisa igual (sin mensaje): pudieron aplicarse algunos.
   */
  private ejecutar(pedidos: Observable<unknown>[], cambio: CambioCocheras, cerrarAlTerminar = false): void {
    this.enviando.set(true);
    this.error.set(null);

    forkJoin(pedidos).subscribe({
      next: () => {
        this.enviando.set(false);
        this.cambiada.emit(cambio);
        if (cerrarAlTerminar) this.cerrar.emit();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
        this.cambiada.emit({});
      },
    });
  }
}
