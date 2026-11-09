import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { EstadisticasPropietario } from '@app/models';
import { MapaCalor } from './mapa-calor/mapa-calor';

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** Demanda por horario de Estadisticas (estadisticas.ts): el mapa de calor de la semana y la hora pico. */
@Component({
  selector: 'app-demanda-horario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapaCalor, Tarjeta],
  templateUrl: './demanda-horario.html',
  styleUrl: '../compartido.css',
  host: { style: 'display: contents' },
})
export class DemandaHorario {
  readonly datos = input.required<EstadisticasPropietario>();

  protected readonly horaPico = computed(() => {
    const pico = this.datos().horaPico;
    return pico ? `Los ${DIAS_PLURAL[pico.diaSemana]} a las ${pico.hora}:00` : null;
  });
}
