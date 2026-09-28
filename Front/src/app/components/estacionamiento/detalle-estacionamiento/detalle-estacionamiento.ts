import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Estacionamiento } from '@app/models';
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
  AGOTADO: 'bg-ocupada/12 text-ocupada',
};

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/**
 * Ficha de un estacionamiento que se abre sobre el mapa al elegirlo: foto,
 * si esta abierto, distancia, precio, disponibilidad para el momento buscado,
 * direccion, horarios de la semana y el boton para reservar.
 *
 * En desktop es una tarjeta flotante a la derecha del mapa; en mobile, una hoja
 * que sube desde abajo. Se cierra con la X o con Escape.
 */
@Component({
  selector: 'app-detalle-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <article
      class="pointer-events-auto flex max-h-full min-h-0 flex-col overflow-hidden rounded-t-[20px] border border-borde bg-papel
             shadow-flotante lg:rounded-tarjeta"
      role="dialog"
      [attr.aria-label]="estacionamiento().nombre"
    >
      <!-- Foto -->
      <div class="relative h-36 shrink-0 bg-acento-suave lg:h-40">
        @if (estacionamiento().fotoUrl; as foto) {
          <img [src]="foto" alt="" class="size-full object-cover" />
        } @else {
          <span class="grid size-full place-items-center text-acento/60" aria-hidden="true">
            <ui-icono nombre="estacionamiento" [tamano]="56" />
          </span>
        }
        <button
          type="button"
          class="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-papel text-tinta
                 shadow-elevada transition-transform duration-160 hover:scale-105"
          aria-label="Cerrar"
          (click)="cerrar.emit()"
        >
          <ui-icono nombre="cerrar" [tamano]="18" />
        </button>
      </div>

      <div class="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
        <!-- Nombre y si esta abierto -->
        <div>
          <h2 class="text-[18px] leading-tight font-semibold text-tinta">{{ estacionamiento().nombre }}</h2>
          <p class="mt-1.5 flex items-center gap-1.5 text-[12.5px]">
            <span
              class="size-2 rounded-full"
              [class.bg-exito]="apertura().abierto"
              [class.bg-ocupada]="!apertura().abierto"
            ></span>
            <span [class.text-exito]="apertura().abierto" [class.text-ocupada]="!apertura().abierto">
              {{ apertura().texto }}
            </span>
          </p>
        </div>

        <!-- Caracteristicas -->
        <ul class="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-grafito">
          @if (distancia(); as texto) {
            <li class="flex items-center gap-1.5">
              <ui-icono nombre="explorar" [tamano]="16" class="text-plomo" />{{ texto }}
            </li>
          }
          <li class="flex items-center gap-1.5">
            <ui-icono nombre="techo" [tamano]="16" class="text-plomo" />
            {{ estacionamiento().cubierto ? 'Cubierto' : 'Descubierto' }}
          </li>
          <li class="flex items-center gap-1.5">
            <ui-icono nombre="auto" [tamano]="16" class="text-plomo" />
            {{ estacionamiento().cocherasTotales }} {{ estacionamiento().cocherasTotales === 1 ? 'cochera' : 'cocheras' }}
          </li>
        </ul>

        <!-- Precio -->
        <div>
          <p class="num-tabular text-[22px] font-bold text-tinta">
            {{ precio().monto }} <span class="text-[13px] font-normal text-plomo">{{ precio().unidad }}</span>
          </p>
          @if (otrasTarifas()) {
            <p class="mt-0.5 text-[12px] text-plomo">{{ otrasTarifas() }}</p>
          }
        </div>

        <div class="h-px bg-borde-sutil"></div>

        <!-- Disponibilidad -->
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-[13px] font-semibold text-tinta">Disponibilidad</p>
            <p class="mt-0.5 text-[12.5px] text-plomo">{{ cuando() }}</p>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" [class]="claseEstado()">
            {{ etiquetaEstado() }}
          </span>
        </div>

        <!-- Direccion -->
        <div class="flex items-start gap-3 border-t border-borde-sutil pt-4">
          <ui-icono nombre="explorar" [tamano]="18" class="mt-0.5 text-plomo" />
          <div class="min-w-0">
            <p class="text-[12px] font-semibold text-tinta">Dirección</p>
            <p class="text-[12.5px] text-grafito">{{ direccion() }}</p>
          </div>
        </div>

        <!-- Horarios -->
        <div class="flex items-start gap-3 border-t border-borde-sutil pt-4">
          <ui-icono nombre="reloj" [tamano]="18" class="mt-0.5 text-plomo" />
          <div class="min-w-0">
            <p class="text-[12px] font-semibold text-tinta">Horarios</p>
            @for (linea of semana(); track linea) {
              <p class="num-tabular text-[12.5px] text-grafito">{{ linea }}</p>
            }
          </div>
        </div>

        @if (estacionamiento().descripcion) {
          <p class="border-t border-borde-sutil pt-4 text-[12.5px] leading-normal text-grafito">
            {{ estacionamiento().descripcion }}
          </p>
        }
      </div>

      <!-- Accion -->
      <div class="shrink-0 border-t border-borde-sutil p-4" style="padding-bottom: max(1rem, env(safe-area-inset-bottom))">
        <button
          type="button"
          class="w-full rounded-control bg-acento px-4 py-3 text-[14px] font-semibold text-sobre-acento
                 shadow-elevada transition-colors duration-160 hover:bg-acento-fuerte
                 disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="agotado()"
          (click)="reservar.emit(estacionamiento())"
        >
          {{ agotado() ? 'Sin lugares para ese momento' : 'Reservar' }}
        </button>
      </div>
    </article>
  `,
  host: {
    // Columna flex: si no entra, la foto y el boton quedan fijos y el medio scrollea.
    // El host no atrapa clicks (en desktop ocupa todo el alto del mapa); la tarjeta si.
    class: 'pointer-events-none flex flex-col',
    '(document:keydown.escape)': 'cerrar.emit()',
  },
})
export class DetalleEstacionamiento {
  readonly estacionamiento = input.required<Estacionamiento>();
  /** Para cuando se busco: "Ahora" o "Sáb 27 sep · 10:00 – 14:00". */
  readonly cuando = input('Ahora');

  readonly cerrar = output<void>();
  readonly reservar = output<Estacionamiento>();

  protected readonly apertura = computed(() => estadoApertura(this.estacionamiento().horarios));
  protected readonly semana = computed(() => resumenSemana(this.estacionamiento().horarios));

  private readonly estado = computed(() =>
    estadoDisponibilidad(this.estacionamiento().cocherasDisponibles),
  );
  protected readonly etiquetaEstado = computed(() => ETIQUETA_ESTADO[this.estado()]);
  protected readonly claseEstado = computed(() => CLASE_ESTADO[this.estado()]);
  protected readonly agotado = computed(() => this.estado() === 'AGOTADO');

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
