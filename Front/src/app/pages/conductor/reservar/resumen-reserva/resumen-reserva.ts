import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Duracion, ETIQUETA_MODALIDAD, Tarifas } from '@app/models';
import { calcularPrecio } from '@app/utils/tarifa.util';
import { RangoHorario } from '../selector-franja/selector-franja';

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/**
 * Resumen de la reserva antes de confirmarla: duracion, como se cobra y total.
 *
 * Se arregla solo: con las tarifas del estacionamiento, la duracion y el
 * horario elegidos calcula el total estimado, el texto de la tarifa y cuanto
 * se ahorra con una estadia o jornada.
 *
 *   <app-resumen-reserva [tarifas]="tarifas" [duracion]="duracion()" [rango]="rango()" />
 */
@Component({
  selector: 'app-resumen-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './resumen-reserva.html',
  host: { class: 'block' },
})
export class ResumenReserva {
  readonly tarifas = input.required<Tarifas>();
  readonly duracion = input.required<Duracion>();
  /** Hora de ingreso y de salida; `null` mientras no se eligio. */
  readonly rango = input<RangoHorario | null>(null);

  /** "3 h · 10:00 – 13:00"; si termina al otro dia, "12 h · 19:00 – 07:00 (+1 día)". */
  protected readonly textoDuracion = computed(() => {
    const { horas } = this.duracion();
    const rango = this.rango();
    if (!rango) return `${horas} h · elegí la hora de ingreso`;
    const otroDia = rango.horaHasta <= rango.horaDesde ? ' (+1 día)' : '';
    return `${horas} h · ${rango.horaDesde} – ${rango.horaHasta}${otroDia}`;
  });

  /** Estimado: el definitivo lo calcula el backend. */
  private readonly total = computed(() => {
    const { modalidad, horas } = this.duracion();
    return calcularPrecio(modalidad, this.tarifas(), horas);
  });

  protected readonly textoTotal = computed(() => this.total().toLocaleString('es-AR'));

  /** "$900 por hora", "Estadía · 12 h" o "Jornada · 24 h". */
  protected readonly textoTarifa = computed(() => {
    const { modalidad } = this.duracion();
    const { hora } = this.tarifas();
    if (modalidad !== 'HORA') return ETIQUETA_MODALIDAD[modalidad];
    return hora !== null ? `${pesos(hora)} por hora` : null;
  });

  /** Con estadia o jornada: cuanto se ahorra frente a pagar esas horas por hora. */
  protected readonly textoAhorro = computed(() => {
    const { modalidad, horas } = this.duracion();
    if (modalidad === 'HORA' || this.tarifas().hora === null) return null;
    const ahorro = calcularPrecio('HORA', this.tarifas(), horas) - this.total();
    return ahorro > 0 ? `Ahorrás ${pesos(ahorro)} frente a pagar por hora` : null;
  });
}
