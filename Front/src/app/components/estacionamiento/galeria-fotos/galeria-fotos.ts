import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Icono } from '@app/components/ui';

/**
 * Fotos del estacionamiento, una al lado de la otra con scroll-snap: en el
 * celular se pasan con el dedo, en desktop con las flechas. Ocupa todo el
 * contenedor, asi que el tamaño y el redondeo los pone quien la usa.
 */
@Component({
  selector: 'app-galeria-fotos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <div
      #pista
      class="flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain
             [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      (scroll)="alScrollear()"
    >
      @for (foto of fotos(); track foto; let i = $index) {
        <img
          class="size-full shrink-0 snap-center object-cover"
          [src]="foto"
          [alt]="fotos().length > 1 ? nombre() + ', foto ' + (i + 1) + ' de ' + fotos().length : nombre()"
          [attr.loading]="i === 0 ? null : 'lazy'"
          draggable="false"
        />
      }
    </div>

    @if (fotos().length > 1) {
      <button
        type="button"
        class="flecha left-2.5"
        aria-label="Foto anterior"
        [disabled]="indice() === 0"
        (click)="mover(-1)"
      >
        <ui-icono class="rotate-90" nombre="cheuron" [tamano]="16" />
      </button>
      <button
        type="button"
        class="flecha right-2.5"
        aria-label="Foto siguiente"
        [disabled]="indice() === fotos().length - 1"
        (click)="mover(1)"
      >
        <ui-icono class="-rotate-90" nombre="cheuron" [tamano]="16" />
      </button>

      <span
        class="num-tabular pointer-events-none absolute right-2.5 bottom-2.5 rounded-full bg-black/55
               px-2 py-0.5 text-[11.5px] font-medium text-white"
        aria-live="polite"
      >
        {{ indice() + 1 }} / {{ fotos().length }}
      </span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
    }

    .flecha {
      position: absolute;
      top: 50%;
      translate: 0 -50%;
      display: none;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: var(--color-papel);
      color: var(--color-tinta);
      box-shadow: var(--shadow-elevada);
      opacity: 0;
      transition: opacity 160ms var(--ease-suave);
    }

    .flecha:disabled {
      visibility: hidden;
    }

    /* Con mouse aparecen al pasar por arriba; en pantallas tactiles se desliza. */
    @media (hover: hover) {
      .flecha {
        display: grid;
      }

      :host(:hover) .flecha,
      .flecha:focus-visible {
        opacity: 1;
      }
    }
  `,
})
export class GaleriaFotos {
  readonly fotos = input.required<string[]>();
  /** Nombre del estacionamiento, para el texto alternativo de cada foto. */
  readonly nombre = input.required<string>();

  private readonly pista = viewChild.required<ElementRef<HTMLElement>>('pista');

  protected readonly indice = signal(0);

  protected alScrollear(): void {
    const { scrollLeft, clientWidth } = this.pista().nativeElement;
    this.indice.set(Math.round(scrollLeft / clientWidth));
  }

  protected mover(paso: 1 | -1): void {
    const pista = this.pista().nativeElement;
    pista.scrollBy({ left: paso * pista.clientWidth, behavior: 'smooth' });
  }
}
