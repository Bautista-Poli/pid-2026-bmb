import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icono } from '@app/components/ui';
import { ETIQUETA_MODALIDAD, HORAS_POR_MODALIDAD, Tarifas } from '@app/models';
import { calcularPrecio, horasReservables, modalidadPorHoras } from '@app/utils/tarifa.util';

interface Atajo {
  horas: number;
  etiqueta: string;
  precio: string;
}

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/** Horas que se ofrecen como atajo, ademas de estadia y jornada. */
const ATAJOS_POR_HORA = [1, 2, 3, 4];

/**
 * Cuantas horas se quiere reservar: un contador (- 3 h +) y atajos con el
 * precio de cada opcion. 12 h y 24 h se cobran como estadia y jornada cuando
 * el estacionamiento tiene esas tarifas.
 */
@Component({
  selector: 'app-selector-duracion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './selector-duracion.html',
  styleUrl: './selector-duracion.css',
  host: { class: 'block' },
})
export class SelectorDuracion {
  readonly tarifas = input.required<Tarifas>();
  readonly horas = input.required<number>();

  readonly horasChange = output<number>();

  private readonly posibles = computed(() => horasReservables(this.tarifas()));

  protected readonly anterior = computed(() => this.posibles().filter((h) => h < this.horas()).at(-1));
  protected readonly siguiente = computed(() => this.posibles().find((h) => h > this.horas()));

  /** "Estadía · 12 h" cuando la duracion elegida tiene tarifa propia. */
  protected readonly tarifaEspecial = computed(() => {
    const modalidad = modalidadPorHoras(this.horas(), this.tarifas());
    return modalidad && modalidad !== 'HORA' ? ETIQUETA_MODALIDAD[modalidad] : null;
  });

  protected readonly atajos = computed<Atajo[]>(() => {
    const tarifas = this.tarifas();
    const posibles = new Set(this.posibles());
    const horas = [
      ...ATAJOS_POR_HORA,
      HORAS_POR_MODALIDAD.ESTADIA,
      HORAS_POR_MODALIDAD.JORNADA,
    ].filter((h) => posibles.has(h));

    return horas.map((h) => {
      const modalidad = modalidadPorHoras(h, tarifas)!;
      return {
        horas: h,
        etiqueta: modalidad === 'HORA' ? `${h} h` : `${h} h · ${modalidad === 'ESTADIA' ? 'Estadía' : 'Jornada'}`,
        precio: pesos(calcularPrecio(modalidad, tarifas, h)),
      };
    });
  });
}
