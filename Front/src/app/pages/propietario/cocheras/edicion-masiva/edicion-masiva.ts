import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Boton, Icono } from '@app/components/ui';
import {
  Cochera,
  ETIQUETA_TIPO_VEHICULO,
  ICONO_TIPO_VEHICULO,
  NuevaCochera,
  TIPOS_VEHICULO,
  TipoVehiculo,
} from '@app/models';

/**
 * Panel lateral de Cocheras (cocheras.ts) cuando hay varias elegidas: tipo,
 * techo y planta para todas juntas. Solo se cambia lo que se toca; lo demas
 * queda como esta. Los cambios los aplica la pantalla al recibir `aplicar`.
 */
@Component({
  selector: 'app-edicion-masiva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Icono],
  templateUrl: './edicion-masiva.html',
  styleUrls: ['../compartido.css', './edicion-masiva.css'],
  host: { style: 'display: contents' },
})
export class EdicionMasiva {
  readonly elegidas = input.required<Cochera[]>();
  readonly enviando = input(false);

  readonly cerrar = output<void>();
  readonly aplicar = output<Partial<NuevaCochera>>();
  readonly darDeBaja = output<void>();

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

  protected aplicarCambios(): void {
    if (!this.hayCambiosMasivos()) return;
    const cambios: Partial<NuevaCochera> = {};
    const tipo = this.masivoTipo();
    const cubierta = this.masivoCubierta();
    const planta = this.masivoPlanta().trim();
    if (tipo) cambios.tipoVehiculo = tipo;
    if (cubierta !== null) cambios.cubierta = cubierta;
    if (planta) cambios.sector = planta;
    this.aplicar.emit(cambios);
  }
}
