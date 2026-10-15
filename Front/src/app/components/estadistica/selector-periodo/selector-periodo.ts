import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { Chip } from '@app/components/ui';
import { errorDeRango, PeriodoElegido, PERIODOS, TipoPeriodo } from '@app/utils/periodo.util';

/** Lo que cambia en la URL: un periodo predefinido, o un rango (y el otro se borra). */
export type CambioPeriodo =
  | { periodo: TipoPeriodo; desde: null; hasta: null }
  | { periodo: null; desde: string; hasta: string };

/**
 * Selector de periodo de los dashboards: "Ultimos 7 dias", "Este mes" o un
 * rango personalizado con fecha desde y hasta (hasta 92 dias, como el back).
 * Es controlado: el periodo vive en la URL y llega por `periodo`.
 */
@Component({
  selector: 'app-selector-periodo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  template: `
    <div class="flex flex-col gap-2.5 sm:items-end">
      <div class="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
        @for (opcion of periodos; track opcion.tipo) {
          <ui-chip [activo]="opcion.tipo === periodo().tipo && !editando()" (alternar)="elegir(opcion.tipo)">
            {{ opcion.etiqueta }}
          </ui-chip>
        }
        <ui-chip [activo]="periodo().tipo === 'RANGO' || editando()" (alternar)="editando.set(true)">
          Personalizado
        </ui-chip>
      </div>

      @if (editando() || periodo().tipo === 'RANGO') {
        <form class="flex flex-wrap items-end gap-2 sm:flex-nowrap" (submit)="$event.preventDefault(); aplicar()">
          <label class="flex flex-col gap-1 text-[12px] text-plomo">
            Desde
            <input
              type="date"
              class="h-10 w-[150px] rounded-control border border-borde bg-papel px-3 text-[13px] text-tinta focus:border-acento focus:outline-none"
              [max]="hasta() || null"
              [value]="desde()"
              (input)="desde.set(leer($event))"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12px] text-plomo">
            Hasta
            <input
              type="date"
              class="h-10 w-[150px] rounded-control border border-borde bg-papel px-3 text-[13px] text-tinta focus:border-acento focus:outline-none"
              [min]="desde() || null"
              [value]="hasta()"
              (input)="hasta.set(leer($event))"
            />
          </label>
          <button
            type="submit"
            class="h-10 rounded-boton bg-acento px-4 text-[13px] font-semibold text-sobre-acento
                   transition-opacity duration-160 disabled:opacity-50"
            [disabled]="error() !== null"
          >
            Aplicar
          </button>
          @if (desde() && hasta() && error(); as mensaje) {
            <p class="w-full text-[12px] text-ocupada" role="alert">{{ mensaje }}</p>
          }
        </form>
      }
    </div>
  `,
})
export class SelectorPeriodo {
  readonly periodo = input.required<PeriodoElegido>();
  readonly cambio = output<CambioPeriodo>();

  protected readonly periodos = PERIODOS;

  /** Abierto el formulario de rango aunque todavia no se haya aplicado. */
  protected readonly editando = signal(false);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly error = computed(() => errorDeRango(this.desde(), this.hasta()));

  constructor() {
    // Las fechas arrancan con el periodo que se esta viendo, asi se ajusta desde ahi.
    effect(() => {
      const { desde, hasta } = this.periodo();
      this.desde.set(desde);
      this.hasta.set(hasta);
    });
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected elegir(periodo: TipoPeriodo): void {
    this.editando.set(false);
    this.cambio.emit({ periodo, desde: null, hasta: null });
  }

  protected aplicar(): void {
    if (this.error()) return;
    this.editando.set(false);
    this.cambio.emit({ periodo: null, desde: this.desde(), hasta: this.hasta() });
  }
}
