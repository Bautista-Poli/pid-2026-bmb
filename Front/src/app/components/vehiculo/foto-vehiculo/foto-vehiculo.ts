import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Miniatura, NombreIcono, TamanoMiniatura } from '@app/components/ui';
import { Vehiculo } from '@app/models';
import { fotoDeVehiculo } from '@app/utils/foto-vehiculo.util';

/** Foto del modelo del vehiculo, con la silueta de su tipo como respaldo. */
@Component({
  selector: 'app-foto-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Miniatura],
  template: `<ui-miniatura [src]="foto()" [icono]="icono()" [tamano]="tamano()" />`,
  host: { class: 'inline-flex shrink-0' },
})
export class FotoVehiculo {
  readonly vehiculo = input.required<Vehiculo>();
  readonly tamano = input<TamanoMiniatura>('sm');

  protected readonly foto = computed(() => fotoDeVehiculo(this.vehiculo()));

  protected readonly icono = computed<NombreIcono>(() =>
    this.vehiculo().tipo === 'MOTO' ? 'moto' : 'auto',
  );
}
