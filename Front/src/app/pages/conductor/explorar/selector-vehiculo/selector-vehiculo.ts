import { ChangeDetectionStrategy, Component, computed, effect, inject, model, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Icono } from '@app/components/ui';
import { ICONO_TIPO_VEHICULO, Vehiculo, descripcionVehiculo } from '@app/models';
import { VehiculoService } from '@app/services/conductor/vehiculo.service';

/**
 * Selector de vehiculo del conductor: muestra uno y con las flechas pasa al
 * anterior o al siguiente. Sin vehiculos cargados ofrece el enlace para agregar uno.
 *
 * Se arregla solo: pide los vehiculos del conductor y arranca en el
 * predeterminado. A quien lo usa solo le deja el elegido:
 *
 *   <app-selector-vehiculo [(vehiculo)]="vehiculo" />
 */
@Component({
  selector: 'app-selector-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icono],
  templateUrl: './selector-vehiculo.html',
  styleUrl: './selector-vehiculo.css',
})
export class SelectorVehiculo {
  private readonly servicio = inject(VehiculoService);

  /** Vehiculo elegido; `null` mientras cargan o si el conductor no tiene ninguno. */
  readonly vehiculo = model<Vehiculo | null>(null);

  private readonly lista = rxResource({
    stream: () => this.servicio.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  /** Con un solo vehiculo las flechas quedan deshabilitadas. */
  protected readonly hayVarios = computed(() => this.lista.value().length > 1);

  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly descripcion = descripcionVehiculo;

  constructor() {
    // Cuando llega la lista, queda elegido el predeterminado (o el primero).
    effect(() => {
      const lista = this.lista.value();
      untracked(() => this.vehiculo.set(lista.find((v) => v.predeterminado) ?? lista[0] ?? null));
    });
  }

  /** Pasa al anterior (-1) o al siguiente (+1), dando la vuelta al llegar a la punta. */
  protected pasar(pasos: number): void {
    const lista = this.lista.value();
    if (lista.length < 2) return;
    const actual = lista.findIndex((v) => v.id === this.vehiculo()?.id);
    this.vehiculo.set(lista[(actual + pasos + lista.length) % lista.length]);
  }
}
