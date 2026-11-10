// Imagen chica (foto de catalogo de un vehiculo) con un icono de respaldo si no hay foto.
import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icono, NombreIcono } from '../icono/icono';

export type TamanoMiniatura = 'sm' | 'lg';

/** Las fotos de catalogo del proyecto miden 400x280; las cajas mantienen esa proporcion. */
const CAJA: Record<TamanoMiniatura, string> = {
  sm: 'h-[78px] w-[112px]',
  lg: 'h-[118px] w-[168px]',
};

const TAMANO_ICONO: Record<TamanoMiniatura, number> = { sm: 30, lg: 40 };

/**
 * Foto chica con un icono de respaldo cuando no hay imagen.
 *
 * Es la pieza presentacional que comparten las miniaturas de vehiculos y
 * cocheras: acá vive la escala de tamaños, así crecen todas juntas.
 *
 * La imagen es decoracion (`alt` vacio): al lado siempre va el texto que la
 * describe, asi que anunciarla seria ruido para un lector de pantalla.

 */
@Component({
  selector: 'ui-miniatura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, Icono],
  template: `
    @if (src(); as ruta) {
      <img [ngSrc]="ruta" width="400" height="280" alt="" [class]="clases()" class="object-cover" />
    } @else {
      <span
        [class]="clases()"
        class="flex items-center justify-center bg-lienzo text-humo"
        aria-hidden="true"
      >
        <ui-icono [nombre]="icono()" [tamano]="tamanoIcono()" />
      </span>
    }
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Miniatura {
  /** Ruta de la foto, o `null` (el default) para mostrar solo el icono. */
  readonly src = input<string | null>(null);
  readonly icono = input.required<NombreIcono>();
  readonly tamano = input<TamanoMiniatura>('sm');

  protected readonly tamanoIcono = computed(() => TAMANO_ICONO[this.tamano()]);

  protected readonly clases = computed(
    () => `${CAJA[this.tamano()]} rounded-control border border-borde-sutil`,
  );
}
