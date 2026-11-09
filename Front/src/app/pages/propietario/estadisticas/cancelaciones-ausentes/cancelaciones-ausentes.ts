import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import {
  EstadisticasPropietario,
  ETIQUETA_ORIGEN_CANCELACION,
  OrigenCancelacionEstadistica,
} from '@app/models';
import { porciento } from '../formato';

const ORIGENES: OrigenCancelacionEstadistica[] = ['CONDUCTOR', 'PROPIETARIO', 'SISTEMA', 'SIN_DATO'];

/**
 * Cancelaciones y ausentes de Estadisticas (estadisticas.ts): cuantas hubo,
 * quien cancelo (barras relativas a la mayor) y con cuanta anticipacion.
 */
@Component({
  selector: 'app-cancelaciones-ausentes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './cancelaciones-ausentes.html',
  styleUrls: ['../compartido.css', './cancelaciones-ausentes.css'],
  host: { style: 'display: contents' },
})
export class CancelacionesAusentes {
  readonly datos = input.required<EstadisticasPropietario>();

  protected readonly origenes = ORIGENES;
  protected readonly etiquetaOrigen = ETIQUETA_ORIGEN_CANCELACION;
  protected readonly porciento = porciento;

  /** Ancho de la barra de un origen, relativo al que mas cancelo. */
  protected anchoOrigen(origen: OrigenCancelacionEstadistica): number {
    const { porOrigen } = this.datos().cancelaciones;
    const mayor = Math.max(1, ...ORIGENES.map((o) => porOrigen[o]));
    return (porOrigen[origen] / mayor) * 100;
  }
}
