import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icono, NombreIcono, Tarjeta } from '@app/components/ui';

/** Tono de cada tarjeta de metrica: fondo del icono y color del trazo. */
export type TonoMetrica = 'azul' | 'verde' | 'violeta';

/** Clase de cada tono (estilos en tarjeta-metrica.css). */
const CLASE_TONO: Record<TonoMetrica, string> = {
  azul: 'tono-azul',
  verde: 'tono-verde',
  violeta: 'tono-violeta',
};

/** Comparacion contra ayer: flecha y color segun el signo. */
export interface Variacion {
  sube: boolean | null;
  texto: string;
}

export interface Metrica {
  etiqueta: string;
  valor: string;
  /** Parte chica del valor ("/ 40"). */
  complemento?: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion?: Variacion;
  detalle?: string;
}

/** Una de las tarjetas de arriba del tablero (tablero.ts): icono, valor y la comparacion con ayer. */
@Component({
  selector: 'app-tarjeta-metrica',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, Tarjeta],
  templateUrl: './tarjeta-metrica.html',
  styleUrls: ['../compartido.css', './tarjeta-metrica.css'],
  host: { style: 'display: contents' },
})
export class TarjetaMetrica {
  readonly metrica = input.required<Metrica>();

  protected readonly claseTono = CLASE_TONO;
}
