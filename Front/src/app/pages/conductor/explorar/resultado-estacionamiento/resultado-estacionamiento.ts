import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NivelEstacionamiento } from '@app/components/estacionamiento';
import { Icono } from '@app/components/ui';
import { Estacionamiento } from '@app/models';
import {
  ETIQUETA_ESTADO,
  estadoDisponibilidad,
  formatearDistancia,
  resumenHorario,
} from '@app/utils/disponibilidad.util';
import { minutosAPie } from '@app/utils/distancia.util';
import { CLASE_ESTADO } from '../constantes';
import { InsigniasEstacionamiento } from '../insignias-estacionamiento/insignias-estacionamiento';
import { pesos } from '../panel.interface';

/**
 * Una tarjeta de la lista de resultados de Explorar (mapa.ts): nombre,
 * nivel, reputacion, direccion, distancia, precio, disponibilidad y horario.
 *
 * Avisa con `enfocado` cuando el mouse pasa por encima o recibe el foco (la
 * pantalla resalta el pin en el mapa) y con `elegido` cuando se la toca.
 */
@Component({
  selector: 'app-resultado-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, InsigniasEstacionamiento, NivelEstacionamiento],
  templateUrl: './resultado-estacionamiento.html',
  styleUrl: './resultado-estacionamiento.css',
})
export class ResultadoEstacionamiento {
  readonly estacionamiento = input.required<Estacionamiento>();
  /** Si es el elegido en el mapa (borde de acento). */
  readonly seleccionado = input(false);

  readonly enfocado = output<void>();
  readonly elegido = output<void>();

  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly claseEstado = CLASE_ESTADO;

  /** DISPONIBLE, POCA o NO_DISPONIBLE. */
  protected readonly estado = computed(() => estadoDisponibilidad(this.estacionamiento()));

  /** "350 m · 5 min a pie" */
  protected readonly distancia = computed(() => {
    const km = this.estacionamiento().distanciaKm;
    if (km == null) return null;
    return `${formatearDistancia(km)} · ${minutosAPie(km)} min a pie`;
  });

  /** "$1.200/h"; si no cobra por hora, la estadia o la jornada. */
  protected readonly precio = computed(() => {
    const { hora, estadia, jornada } = this.estacionamiento().tarifas;
    if (hora != null) return `${pesos(hora)}/h`;
    if (estadia != null) return `${pesos(estadia)} estadía`;
    if (jornada != null) return `${pesos(jornada)} jornada`;
    return '';
  });

  protected readonly horario = computed(() => resumenHorario(this.estacionamiento().horarios));
}
