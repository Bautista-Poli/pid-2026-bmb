import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import {
  Cochera,
  ETIQUETA_ESTADO_COCHERA,
  EstadoCochera,
  ICONO_TIPO_VEHICULO,
  Id,
  cocheraActiva,
} from '@app/models';
import { Planta } from '../planta.interface';

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
 * cocheras de la planta activa y la leyenda.
 *
 * Se arregla solo: sabe que planta se esta viendo y como se eligen las
 * cocheras (clic, Shift / Ctrl / Cmd + clic, "Elegir toda la planta"). A quien
 * lo usa le deja la planta que se ve y los ids elegidos:
 *
 *   <app-plano-cocheras [plantas]="plantas()" [(planta)]="planta" [(seleccion)]="seleccion" />
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

  /** Nombre de la planta que se ve; `null` (o una que ya no existe) muestra la primera. */
  readonly planta = model<string | null>(null);
  /** Ids de las cocheras elegidas (anillo de acento). */
  readonly seleccion = model<Id[]>([]);

  /** "+ Nueva planta": el alta de cocheras es de la pantalla. */
  readonly nuevaPlanta = output<void>();

  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_COCHERA;
  protected readonly claseCochera = CLASE_COCHERA;
  protected readonly clasePunto = CLASE_PUNTO;
  protected readonly claseBloqueada = CLASE_BLOQUEADA;

  protected readonly plantaActiva = computed<Planta | null>(() => {
    const lista = this.plantas();
    return lista.find((p) => p.nombre === this.planta()) ?? lista[0] ?? null;
  });

  protected estaElegida(cochera: Cochera): boolean {
    return this.seleccion().includes(cochera.id);
  }

  /** Clic: elige solo esa (o la suelta). Shift / Ctrl / Cmd: la suma o la saca. */
  protected tocar(cochera: Cochera, evento: MouseEvent): void {
    const elegidas = this.seleccion();
    if (evento.shiftKey || evento.metaKey || evento.ctrlKey) {
      this.seleccion.set(
        elegidas.includes(cochera.id)
          ? elegidas.filter((id) => id !== cochera.id)
          : [...elegidas, cochera.id],
      );
    } else if (elegidas.length === 1 && elegidas[0] === cochera.id) {
      this.seleccion.set([]);
    } else {
      this.seleccion.set([cochera.id]);
    }
  }

  /** Elige todas las cocheras activas de la planta que se ve. */
  protected elegirTodaLaPlanta(): void {
    const planta = this.plantaActiva();
    if (planta) this.seleccion.set(planta.cocheras.filter(cocheraActiva).map((c) => c.id));
  }
}
