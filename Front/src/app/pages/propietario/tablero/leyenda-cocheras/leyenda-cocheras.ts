import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PuntoEstado } from '../punto-estado/punto-estado';

/** Leyenda de colores de la cuadricula de cocheras. */
@Component({
  selector: 'app-leyenda-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PuntoEstado],
  template: `
    <ul class="flex flex-wrap gap-[18px]">
      <li class="flex items-center gap-[7px]">
        <ui-punto-estado tono="acento" />
        <span class="text-[11.5px] text-plomo">Libre</span>
      </li>
      <li class="flex items-center gap-[7px]">
        <ui-punto-estado tono="ocupada" />
        <span class="text-[11.5px] text-plomo">Ocupada</span>
      </li>
      <li class="flex items-center gap-[7px]">
        <ui-punto-estado tono="reservada" />
        <span class="text-[11.5px] text-plomo">Reservada</span>
      </li>
    </ul>
  `,
  host: { class: 'block' },
})
export class LeyendaCocheras {}
