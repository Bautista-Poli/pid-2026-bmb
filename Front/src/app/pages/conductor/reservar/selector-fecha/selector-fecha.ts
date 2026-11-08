import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FechaISO } from '@app/models';
import { aFechaISO, proximosDias } from '@app/utils/fecha.util';

/** Grilla de 5 dias: dia de la semana arriba, numero abajo. */
@Component({
  selector: 'app-selector-fecha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './selector-fecha.html',
  styleUrl: './selector-fecha.css',
  host: { class: 'block' },
})
export class SelectorFecha {
  readonly dias = input(5);
  readonly seleccionada = model<FechaISO | null>(null);

  protected readonly fechas = computed(() =>
    proximosDias(this.dias()).map((fecha) => ({ fecha, iso: aFechaISO(fecha) })),
  );
}
