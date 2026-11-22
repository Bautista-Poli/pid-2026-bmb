import { ChangeDetectionStrategy, Component, computed, effect, input, model, untracked } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Duracion, ETIQUETA_MODALIDAD, HORAS_POR_MODALIDAD, Tarifas } from '@app/models';
import { calcularPrecio, duracionReservable, horasReservables, modalidadPorHoras } from '@app/utils/tarifa.util';

interface Atajo {
  horas: number;
  etiqueta: string;
  precio: string;
}

/** Nombre de las modalidades por bloque en el selector ("12 h · Estadía"). */
const NOMBRE_BLOQUE: Record<'ESTADIA' | 'JORNADA', string> = { ESTADIA: 'Estadía', JORNADA: 'Jornada' };

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/** Horas que se ofrecen como atajo, ademas de estadia y jornada. */
const ATAJOS_POR_HORA = [1, 2, 3, 4];

/**
 * Cuantas horas se quiere reservar: un contador (- 3 h +) y atajos con el
 * precio de cada opcion. 12 h y 24 h se cobran como estadia y jornada cuando
 * el estacionamiento tiene esas tarifas.
 *
 * Se arregla solo: sabe que cantidades se pueden reservar con las tarifas del
 * estacionamiento y con que modalidad se cobra cada una; si lo elegido no se
 * puede reservar ahi, pasa a la primera cantidad que si. A quien lo usa solo le
 * deja la duracion (horas y modalidad):
 *
 *   <app-selector-duracion [tarifas]="tarifas" [(duracion)]="duracion" />
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
  readonly duracion = model.required<Duracion>();

  protected readonly horas = computed(() => this.duracion().horas);

  constructor() {
    // Con otras tarifas (otro estacionamiento) lo elegido puede dejar de valer.
    effect(() => {
      const actual = this.duracion();
      const valida = duracionReservable(actual.horas, this.tarifas());
      if (valida && (valida.horas !== actual.horas || valida.modalidad !== actual.modalidad)) {
        untracked(() => this.duracion.set(valida));
      }
    });
  }

  protected elegir(horas: number): void {
    const duracion = duracionReservable(horas, this.tarifas());
    if (duracion) this.duracion.set(duracion);
  }

  private readonly posibles = computed(() => horasReservables(this.tarifas()));

  protected readonly anterior = computed(() => this.posibles().filter((h) => h < this.horas()).at(-1));
  protected readonly siguiente = computed(() => this.posibles().find((h) => h > this.horas()));

  /** "Estadía · 12 h" cuando la duracion elegida tiene tarifa propia. */
  protected readonly tarifaEspecial = computed(() => {
    const { modalidad } = this.duracion();
    return modalidad !== 'HORA' ? ETIQUETA_MODALIDAD[modalidad] : null;
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
        etiqueta: modalidad === 'HORA' ? `${h} h` : `${h} h · ${NOMBRE_BLOQUE[modalidad]}`,
        precio: pesos(calcularPrecio(modalidad, tarifas, h)),
      };
    });
  });
}
