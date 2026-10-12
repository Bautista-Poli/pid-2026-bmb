import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Un tramo de una barra apilada: su valor y la clase de color. */
export interface Tramo {
  valor: number;
  clase: string;
  etiqueta: string;
}

/** Una barra: lo que se muestra debajo y los tramos de abajo hacia arriba. */
export interface BarraDia {
  clave: string;
  etiqueta: string;
  tramos: Tramo[];
  /** Detalle del tooltip ("5 h de 24 h"). */
  detalle: string;
}

const ALTO_PX = 180;

/**
 * Barras verticales apiladas por dia, sin librerias: cada barra mide en
 * proporcion al maximo del periodo. Con muchos dias (30) las etiquetas se
 * muestran salteadas para que no se pisen.
 */
@Component({
  selector: 'app-barras-dia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2" role="group" [attr.aria-label]="descripcion()">
      <div class="flex items-end gap-[3px]" [style.height.px]="alto">
        @for (barra of barras(); track barra.clave) {
          <!-- Con foco (teclado o toque) tambien se ve el detalle; el lector lo lee del aria-label. -->
          <div
            class="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
            tabindex="0"
            role="img"
            [attr.aria-label]="barra.detalle"
          >
            <div class="flex flex-col-reverse overflow-hidden rounded-t-[3px]" [style.height.%]="porcentaje(barra)">
              @for (tramo of barra.tramos; track tramo.etiqueta) {
                @if (tramo.valor > 0) {
                  <div [class]="tramo.clase" [style.flex-grow]="tramo.valor"></div>
                }
              }
            </div>
            <div
              class="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 hidden -translate-x-1/2
                     rounded-boton border border-borde bg-papel px-3 py-2 text-[12px] whitespace-nowrap
                     shadow-flotante group-hover:block group-focus:block"
            >
              <p class="num-tabular text-tinta">{{ barra.detalle }}</p>
            </div>
          </div>
        }
      </div>
      <div class="flex gap-[3px]">
        @for (barra of barras(); track barra.clave; let i = $index) {
          <span class="num-tabular min-w-0 flex-1 text-center text-[10.5px] text-humo">
            {{ i % salto() === 0 ? barra.etiqueta : '' }}
          </span>
        }
      </div>
    </div>
  `,
  host: { class: 'block' },
})
export class BarrasDia {
  readonly barras = input.required<BarraDia[]>();
  readonly descripcion = input('Gráfico de barras por día');
  /** Si se pasa, las barras se miden contra este maximo (p. ej. horas ofrecidas). */
  readonly maximo = input<number | null>(null);

  protected readonly alto = ALTO_PX;

  private readonly mayor = computed(() => {
    const totales = this.barras().map((b) => b.tramos.reduce((suma, t) => suma + t.valor, 0));
    return this.maximo() ?? Math.max(0, ...totales);
  });

  /** Cada cuantas barras se escribe la etiqueta: con 30 dias, una por semana. */
  protected readonly salto = computed(() => Math.max(1, Math.ceil(this.barras().length / 10)));

  protected porcentaje(barra: BarraDia): number {
    const total = barra.tramos.reduce((suma, t) => suma + t.valor, 0);
    const mayor = this.mayor();
    return mayor > 0 ? Math.min(100, (total / mayor) * 100) : 0;
  }
}
