import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Boton, Miniatura } from '@app/components/ui';

/** Lo que acepta el endpoint de subida (`estacionamiento.routes.js`). */
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAXIMO_BYTES = 2 * 1024 * 1024;

/**
 * Elige la foto del estacionamiento y la muestra en vista previa.
 *
 * No sube nada: para subir hace falta el id del estacionamiento, que en el alta
 * recien existe despues del POST. Emite el archivo elegido (o `null` para
 * sacar la foto que ya estaba) y decide la pagina cuando mandarlo.
 */
@Component({
  selector: 'app-foto-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Miniatura],
  templateUrl: './foto-estacionamiento.html',
})
export class FotoEstacionamiento {
  private readonly destroyRef = inject(DestroyRef);

  /** Foto ya guardada, si el estacionamiento tiene una. */
  readonly fotoActual = input<string | null>(null);

  /** El archivo elegido, o `null` para quitar la foto guardada. */
  readonly cambio = output<File | null>();

  protected readonly tiposAceptados = TIPOS.join(',');
  protected readonly error = signal<string | null>(null);

  /** URL local del archivo elegido; hay que revocarla a mano. */
  private readonly vistaPrevia = signal<string | null>(null);
  /** `true` cuando se pidio sacar la foto guardada y todavia no se guardo. */
  private readonly quitada = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.revocar());
  }

  /** Lo que se ve: la elegida recien, la guardada, o nada. */
  protected fuente(): string | null {
    return this.vistaPrevia() ?? (this.quitada() ? null : this.fotoActual());
  }

  protected elegir(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    // Se valida antes de mandar para no gastar una subida entera en vano.
    if (!TIPOS.includes(archivo.type)) {
      this.error.set('La foto tiene que ser JPG, PNG o WEBP.');
    } else if (archivo.size > MAXIMO_BYTES) {
      this.error.set('La foto no puede pasar los 2 MB.');
    } else {
      this.error.set(null);
      this.revocar();
      this.vistaPrevia.set(URL.createObjectURL(archivo));
      this.quitada.set(false);
      this.cambio.emit(archivo);
    }

    // Se limpia para que volver a elegir el mismo archivo dispare el evento.
    input.value = '';
  }

  protected quitar(): void {
    this.revocar();
    this.error.set(null);
    this.quitada.set(true);
    this.cambio.emit(null);
  }

  private revocar(): void {
    const url = this.vistaPrevia();
    if (url) URL.revokeObjectURL(url);
    this.vistaPrevia.set(null);
  }
}
