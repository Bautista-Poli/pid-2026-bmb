import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Cochera, EstadoCochera } from '@app/models';

/** Fila de conteos arriba del plano (cocheras.ts): libres, ocupadas, reservadas, techo y de baja. */
@Component({
  selector: 'app-resumen-cocheras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './resumen-cocheras.html',
  styleUrls: ['../compartido.css', './resumen-cocheras.css'],
  host: { style: 'display: contents' },
})
export class ResumenCocheras {
  readonly cocheras = input.required<Cochera[]>();

  protected readonly resumen = computed(() => {
    const lista = this.cocheras();
    const contar = (estado: EstadoCochera) => lista.filter((c) => c.estado === estado).length;
    return {
      total: lista.length - contar('INACTIVA'),
      libres: contar('LIBRE'),
      ocupadas: contar('OCUPADA'),
      reservadas: contar('RESERVADA'),
      inactivas: contar('INACTIVA'),
      cubiertas: lista.filter((c) => c.estado !== 'INACTIVA' && c.cubierta).length,
      descubiertas: lista.filter((c) => c.estado !== 'INACTIVA' && !c.cubierta).length,
    };
  });
}
