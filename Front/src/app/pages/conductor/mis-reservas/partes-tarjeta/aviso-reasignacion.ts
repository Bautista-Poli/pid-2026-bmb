import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReservaDetallada } from '@app/models';

/** Aviso de que el estacionamiento reasigno o cancelo la reserva, con su motivo. No pinta nada si no hay motivo. */
@Component({
  selector: 'app-aviso-reasignacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin caja propia: si no hay motivo, no ocupa lugar ni suma separacion en la tarjeta.
  host: { class: 'contents' },
  template: `
    @let r = reserva();
    @if (r.motivoReasignacion; as motivo) {
      <p
        class="rounded-control border px-3 py-2 text-[12px]"
        [class]="
          r.estado === 'CANCELADA'
            ? 'border-ocupada/25 bg-ocupada/5 text-ocupada'
            : 'border-baja/25 bg-baja/8 text-baja'
        "
        role="status"
      >
        {{ motivo }}
      </p>
    }
  `,
})
export class AvisoReasignacion {
  readonly reserva = input.required<ReservaDetallada>();
}
