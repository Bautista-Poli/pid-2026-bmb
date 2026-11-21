import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChapaPatente } from '@app/components/vehiculo';
import { ETIQUETA_TIPO_VEHICULO, ReservaDetallada } from '@app/models';

/** Con que auto y en que cochera es la reserva: dos casilleros lado a lado. */
@Component({
  selector: 'app-vehiculo-y-cochera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChapaPatente],
  host: { class: 'grid gap-2.5 sm:grid-cols-2' },
  template: `
    @let r = reserva();
    <div class="flex min-w-0 items-center gap-3 rounded-control border border-borde-sutil bg-lienzo px-3 py-2.5">
      <ui-chapa-patente [patente]="r.vehiculo.patente" />
      <span class="truncate text-[12.5px] text-grafito">{{ vehiculo() }}</span>
    </div>

    @if (r.cochera; as cochera) {
      <div class="flex min-w-0 items-center gap-3 rounded-control border border-borde-sutil bg-lienzo px-3 py-2.5">
        <span
          class="grid size-7 shrink-0 place-items-center rounded-boton bg-acento text-[13px]
                 font-bold text-sobre-acento"
          aria-hidden="true"
        >
          P
        </span>
        <span class="truncate text-[12.5px] text-grafito">
          <span class="font-semibold text-tinta">{{ cochera.identificador }}</span>
          @if (cochera.sector) {
            · {{ cochera.sector }}
          }
        </span>
      </div>
    } @else {
      <div class="flex min-w-0 items-center gap-3 rounded-control border border-dashed border-borde px-3 py-2.5">
        <span
          class="grid size-7 shrink-0 place-items-center rounded-boton border border-dashed
                 border-humo text-[13px] font-bold text-plomo"
          aria-hidden="true"
        >
          P
        </span>
        <span class="text-[12.5px] text-plomo">Cochera a asignar</span>
      </div>
    }
  `,
})
export class VehiculoYCochera {
  readonly reserva = input.required<ReservaDetallada>();

  protected readonly vehiculo = computed(() => {
    const { marca, modelo, tipo } = this.reserva().vehiculo;
    const nombre = [marca, modelo].filter(Boolean).join(' ');
    return [nombre, ETIQUETA_TIPO_VEHICULO[tipo]].filter(Boolean).join(' · ');
  });
}
