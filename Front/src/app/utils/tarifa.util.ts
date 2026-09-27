import { HORAS_POR_MODALIDAD, ModalidadReserva, Tarifas } from '@app/models';

const CLAVE: Record<ModalidadReserva, keyof Tarifas> = {
  HORA: 'hora',
  ESTADIA: 'estadia',
  JORNADA: 'jornada',
};

const ORDEN: ModalidadReserva[] = ['HORA', 'ESTADIA', 'JORNADA'];

const pesos = (monto: number) => `$${monto.toLocaleString('es-AR')}`;

/** Las modalidades con tarifa, en el orden en que se muestran. Un 0 cuenta como ofrecida. */
export function modalidadesOfrecidas(tarifas: Tarifas): ModalidadReserva[] {
  return ORDEN.filter((modalidad) => tarifas[CLAVE[modalidad]] !== null);
}

/** Precio estimado (el definitivo lo calcula el backend). `horas` solo cuenta por hora. */
export function calcularPrecio(modalidad: ModalidadReserva, tarifas: Tarifas, horas: number): number {
  const tarifa = tarifas[CLAVE[modalidad]];
  if (tarifa === null) return 0;
  return modalidad === 'HORA' ? Math.round(horas * tarifa) : tarifa;
}

/** "$900/h · $5.000 estadía (12 h) · $8.000 jornada (24 h)" */
export function resumenTarifas(tarifas: Tarifas): string {
  const partes: string[] = [];
  if (tarifas.hora !== null) partes.push(`${pesos(tarifas.hora)}/h`);
  if (tarifas.estadia !== null) {
    partes.push(`${pesos(tarifas.estadia)} estadía (${HORAS_POR_MODALIDAD.ESTADIA} h)`);
  }
  if (tarifas.jornada !== null) {
    partes.push(`${pesos(tarifas.jornada)} jornada (${HORAS_POR_MODALIDAD.JORNADA} h)`);
  }
  return partes.join(' · ');
}
