import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icono } from '@app/components/ui';
import { ReservaDetallada } from '@app/models';
import { linksComoLlegar } from '@app/utils/mapas.util';

/** Como llegar al estacionamiento: abre la navegacion en la app que use el conductor. */
@Component({
  selector: 'app-como-llegar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  host: { class: 'block' },
  template: `
    <nav class="flex flex-wrap items-center gap-2" aria-label="Cómo llegar">
      <span class="flex items-center gap-1.5 text-[12.5px] text-plomo">
        <ui-icono nombre="navegar" [tamano]="15" />
        Cómo llegar
      </span>
      @for (link of links(); track link.app) {
        <a
          class="inline-flex min-h-9 items-center rounded-full border border-borde px-3 text-[12.5px]
                 font-medium text-tinta transition-colors duration-160 ease-out hover:border-acento-borde
                 hover:bg-acento-suave"
          [href]="link.url"
          target="_blank"
          rel="noopener"
        >
          {{ link.app }}
        </a>
      }
    </nav>
  `,
})
export class ComoLlegar {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly links = computed(() => linksComoLlegar(this.reserva().estacionamiento.direccion));
}
