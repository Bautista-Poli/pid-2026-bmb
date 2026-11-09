import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, Chip, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Cochera, Estacionamiento, ETIQUETA_TIPO_VEHICULO, Id } from '@app/models';
import { CeldaCochera } from '../celda-cochera/celda-cochera';
import { LeyendaCocheras } from '../leyenda-cocheras/leyenda-cocheras';

/**
 * "Estado de cocheras" del tablero (tablero.ts): la cuadricula de cocheras del
 * estacionamiento activo, el cambio entre estacionamientos y el detalle de la
 * cochera tocada.
 */
@Component({
  selector: 'app-estado-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, CeldaCochera, LeyendaCocheras, Boton, Cargando, Chip, EstadoVacio, Tarjeta],
  templateUrl: './estado-cocheras.html',
  styleUrls: ['../compartido.css', './estado-cocheras.css'],
  host: { style: 'display: contents' },
})
export class EstadoCocheras {
  readonly estacionamientos = input.required<Estacionamiento[]>();
  readonly activo = input.required<Estacionamiento>();
  readonly cocheras = input.required<Cochera[]>();
  readonly cargando = input(false);

  readonly seleccionar = output<Id>();

  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;

  /** La cochera con el detalle abierto; se cierra al cambiar de estacionamiento. */
  protected readonly cocheraAbierta = linkedSignal<Id, Cochera | null>({
    source: () => this.activo().id,
    computation: () => null,
  });

  protected readonly actualizadoEn = computed(() => {
    this.cocheras();
    return new Date();
  });

  protected abrir(cochera: Cochera): void {
    this.cocheraAbierta.update((actual) => (actual?.id === cochera.id ? null : cochera));
  }
}
