import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '@app/components/ui';
import { CATEGORIAS_CALIFICACION, Estacionamiento, formatearNota } from '@app/models';
import { InsigniasEstacionamiento } from '../insignias-estacionamiento/insignias-estacionamiento';
import {
  ETIQUETA_ESTADO,
  EstadoDisponibilidad,
  estadoDisponibilidad,
  formatearDistancia,
} from '@app/utils/disponibilidad.util';
import { minutosAPie } from '@app/utils/distancia.util';
import { estadoApertura, resumenSemana } from '@app/utils/horario-semana.util';

const CLASE_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'bg-exito-suave text-exito',
  POCA: 'bg-baja/15 text-baja',
  NO_DISPONIBLE: 'bg-humo/15 text-[color-mix(in_srgb,var(--color-ocupada)_55%,var(--color-plomo))]',
};

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/**
 * Ficha de un estacionamiento que se abre sobre el mapa al elegirlo:
 * si esta abierto, distancia, precio, disponibilidad para el momento buscado,
 * direccion, horarios de la semana y el boton para reservar.
 *
 * En desktop es una tarjeta flotante a la derecha del mapa; en mobile, una hoja
 * que sube desde abajo. Se cierra con la X o con Escape.
 */
@Component({
  selector: 'app-detalle-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, RouterLink, InsigniasEstacionamiento],
  templateUrl: './detalle-estacionamiento.html',
  styleUrl: './detalle-estacionamiento.css',
  host: {
    // Columna flex: si no entra, el encabezado y el boton quedan fijos y el medio scrollea.
    // El host no atrapa clicks (en desktop ocupa todo el alto del mapa); la tarjeta si.
    class: 'pointer-events-none flex flex-col',
    '(document:keydown.escape)': 'cerrar.emit()',
  },
})
export class DetalleEstacionamiento {
  /** Las dos categorias mejor calificadas: "Limpieza 4,8 · Atención 4,9". */
  protected readonly mejoresCategorias = computed(() => {
    const promedios = this.estacionamiento().reputacion.categorias;
    if (!promedios) return null;
    return CATEGORIAS_CALIFICACION.filter((c) => promedios[c.codigo] != null)
      .sort((a, b) => (promedios[b.codigo] ?? 0) - (promedios[a.codigo] ?? 0))
      .slice(0, 2)
      .map((c) => `${c.nombre} ${formatearNota(promedios[c.codigo])}`)
      .join(' · ');
  });

  readonly estacionamiento = input.required<Estacionamiento>();
  /** Para cuando se busco: "Ahora" o "Sáb 27 sep · 10:00 – 14:00". */
  readonly cuando = input('Ahora');

  readonly cerrar = output<void>();
  readonly reservar = output<Estacionamiento>();

  protected readonly apertura = computed(() => estadoApertura(this.estacionamiento().horarios));
  protected readonly semana = computed(() => resumenSemana(this.estacionamiento().horarios));

  private readonly estado = computed(() => estadoDisponibilidad(this.estacionamiento()));
  protected readonly etiquetaEstado = computed(() => ETIQUETA_ESTADO[this.estado()]);
  protected readonly claseEstado = computed(() => CLASE_ESTADO[this.estado()]);
  protected readonly agotado = computed(() => this.estado() === 'NO_DISPONIBLE');

  /** "350 m · 5 min a pie" */
  protected readonly distancia = computed(() => {
    const km = this.estacionamiento().distanciaKm;
    return km == null ? null : `${formatearDistancia(km)} · ${minutosAPie(km)} min a pie`;
  });

  /** El precio grande: por hora; si no cobra por hora, la estadia o la jornada. */
  protected readonly precio = computed(() => {
    const { hora, estadia, jornada } = this.estacionamiento().tarifas;
    if (hora != null) return { monto: pesos(hora), unidad: '/ hora' };
    if (estadia != null) return { monto: pesos(estadia), unidad: '/ estadía 12 h' };
    if (jornada != null) return { monto: pesos(jornada), unidad: '/ jornada 24 h' };
    return { monto: '—', unidad: '' };
  });

  /** Las otras modalidades, chiquitas debajo del precio. */
  protected readonly otrasTarifas = computed(() => {
    const { hora, estadia, jornada } = this.estacionamiento().tarifas;
    const partes: string[] = [];
    if (hora != null && estadia != null) partes.push(`Estadía 12 h ${pesos(estadia)}`);
    if ((hora != null || estadia != null) && jornada != null) partes.push(`Jornada 24 h ${pesos(jornada)}`);
    return partes.join(' · ');
  });

  protected readonly direccion = computed(() => {
    const { direccion, barrioZona } = this.estacionamiento();
    const calle = `${direccion.calle} ${direccion.numero}`.trim();
    return [calle, barrioZona, direccion.ciudad].filter(Boolean).join(', ');
  });
}
