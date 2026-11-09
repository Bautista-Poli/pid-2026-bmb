import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Cochera, ETIQUETA_ESTADO_COCHERA, EstadoCochera, ICONO_TIPO_VEHICULO, Id } from '@app/models';
import { Planta } from '../constantes';

/** Fondo y borde de cada cochera del plano segun su estado (estilos en plano-cocheras.css). */
const CLASE_COCHERA: Record<EstadoCochera, string> = {
  LIBRE: 'cochera-libre',
  OCUPADA: 'cochera-ocupada',
  RESERVADA: 'cochera-reservada',
  INACTIVA: 'cochera-inactiva',
};

/** Color del punto de estado de cada cochera. */
const CLASE_PUNTO: Record<EstadoCochera, string> = {
  LIBRE: 'punto-libre',
  OCUPADA: 'punto-ocupada',
  RESERVADA: 'punto-reservada',
  INACTIVA: 'punto-inactiva',
};

/** Bloqueada por mantenimiento: se superpone al color del estado, no lo reemplaza. */
const CLASE_BLOQUEADA = 'cochera-bloqueada';

/**
 * El plano de Cocheras (cocheras.ts): las pestañas de plantas, la grilla de
 * cocheras de la planta activa y la leyenda. No elige nada por si mismo: avisa
 * a la pantalla que planta o cochera se toco.
 */
@Component({
  selector: 'app-plano-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './plano-cocheras.html',
  styleUrls: ['../compartido.css', './plano-cocheras.css'],
  host: { style: 'display: contents' },
})
export class PlanoCocheras {
  readonly plantas = input.required<Planta[]>();
  readonly plantaActiva = input<Planta | null>(null);
  /** Ids de las cocheras elegidas (anillo de acento). */
  readonly seleccion = input<Id[]>([]);

  readonly plantaElegida = output<string>();
  /** El evento va para saber si se toco con Shift / Ctrl / Cmd. */
  readonly tocada = output<{ cochera: Cochera; evento: MouseEvent }>();
  readonly nuevaPlanta = output<void>();
  readonly todaLaPlanta = output<void>();

  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_COCHERA;
  protected readonly claseCochera = CLASE_COCHERA;
  protected readonly clasePunto = CLASE_PUNTO;
  protected readonly claseBloqueada = CLASE_BLOQUEADA;

  protected estaElegida(cochera: Cochera): boolean {
    return this.seleccion().includes(cochera.id);
  }
}
