import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icono, NombreIcono, Tarjeta } from '@app/components/ui';
import { Variacion } from '@app/utils/periodo.util';

export type TonoMetrica = 'azul' | 'verde' | 'violeta' | 'ambar' | 'rojo';

const CLASE_TONO: Record<TonoMetrica, string> = {
  azul: 'bg-acento-suave text-acento',
  verde: 'bg-exito-suave text-exito',
  violeta: 'bg-violet-500/12 text-violet-500',
  ambar: 'bg-baja/10 text-baja',
  rojo: 'bg-ocupada/10 text-ocupada',
};

/**
 * KPI de un dashboard: icono, valor grande y la comparacion con el periodo
 * anterior (verde si mejoro, rojo si empeoro). Mismo dibujo que las metricas
 * del tablero del propietario.
 */
@Component({
  selector: 'app-tarjeta-metrica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, Tarjeta],
  template: `
    <ui-tarjeta relleno="ninguno">
      <div class="flex items-start gap-4 p-5">
        <span class="grid size-11 shrink-0 place-items-center rounded-full" [class]="claseTono()">
          <ui-icono [nombre]="icono()" [tamano]="21" />
        </span>
        <div class="min-w-0">
          <p class="text-[13px] font-medium text-plomo">{{ etiqueta() }}</p>
          <p class="num-tabular mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-tinta">
            {{ valor() }}
          </p>
          @if (variacion(); as v) {
            <p
              class="mt-2.5 flex items-center gap-1 text-[12px] font-medium"
              [class]="v.sube === null ? 'text-plomo' : v.sube ? 'text-exito' : 'text-ocupada'"
            >
              @if (v.sube !== null) {
                <ui-icono [nombre]="v.texto.startsWith('+') ? 'subir' : 'bajar'" [tamano]="14" />
              }
              {{ v.texto }}
            </p>
          }
        </div>
      </div>
    </ui-tarjeta>
  `,
  host: { class: 'block' },
})
export class TarjetaMetrica {
  readonly etiqueta = input.required<string>();
  readonly valor = input.required<string>();
  readonly icono = input.required<NombreIcono>();
  readonly tono = input<TonoMetrica>('azul');
  readonly variacion = input<Variacion | null>(null);

  protected readonly claseTono = computed(() => CLASE_TONO[this.tono()]);
}
