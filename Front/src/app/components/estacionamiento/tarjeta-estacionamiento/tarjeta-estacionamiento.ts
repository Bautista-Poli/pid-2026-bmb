import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Estacionamiento } from '@app/models';
import {
  formatearDistancia,
  resumenHorario,
  textoDisponibilidad,
  tonoDisponibilidad,
} from '@app/utils/disponibilidad.util';
import { resumenTarifas } from '@app/utils/tarifa.util';
import { Boton, Miniatura, PuntoEstado, Tarjeta } from '@app/components/ui';

/**
 * Ficha de estacionamiento del listado.
 * Mobile: el boton "Reservar" ocupa el ancho completo abajo.
 * Desktop (>=1024px): pasa a la fila de disponibilidad, a la derecha.
 */
@Component({
  selector: 'app-tarjeta-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta, Boton, Miniatura, PuntoEstado],
  templateUrl: './tarjeta-estacionamiento.html',
  host: { class: 'block' },
})
export class TarjetaEstacionamiento {
  readonly estacionamiento = input.required<Estacionamiento>();

  readonly reservar = output<Estacionamiento>();

  protected readonly libres = computed(() => this.estacionamiento().cocherasDisponibles);
  protected readonly tono = computed(() => tonoDisponibilidad(this.libres()));
  protected readonly disponibilidad = computed(() => textoDisponibilidad(this.libres()));
  protected readonly horario = computed(() => resumenHorario(this.estacionamiento().horarios));

  /** "Av. Belgrano 1240 · 350 m" */
  protected readonly ubicacion = computed(() => {
    const { direccion, distanciaKm } = this.estacionamiento();
    const distancia = formatearDistancia(distanciaKm);
    const base = `${direccion.calle} ${direccion.numero}`.trim();
    return distancia ? `${base} · ${distancia}` : base;
  });

  /** "$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)" */
  protected readonly tarifas = computed(() => resumenTarifas(this.estacionamiento().tarifas));
}
