import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ETIQUETA_TIPO_VEHICULO, Id, Vehiculo } from '@app/models';

/** Filas seleccionables de vehiculo, con radio button a la derecha. */
@Component({
  selector: 'app-selector-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './selector-vehiculo.html',
  styleUrl: './selector-vehiculo.css',
  host: { class: 'block' },
})
export class SelectorVehiculo {
  readonly vehiculos = input.required<Vehiculo[]>();
  readonly seleccionado = model<Id | null>(null);

  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
}
