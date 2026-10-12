import { FechaISO } from './api.model';

/** Un valor del periodo y el del periodo anterior de igual largo. */
export interface ValorComparado {
  valor: number;
  anterior: number;
}

export type OrigenCancelacionEstadistica = 'CONDUCTOR' | 'PROPIETARIO' | 'SISTEMA' | 'SIN_DATO';

export const ETIQUETA_ORIGEN_CANCELACION: Record<OrigenCancelacionEstadistica, string> = {
  CONDUCTOR: 'El conductor',
  PROPIETARIO: 'El estacionamiento',
  SISTEMA: 'Vencidas sin confirmar',
  SIN_DATO: 'Sin dato',
};

/** `GET /api/estadisticas/propietario`. La API ya responde en camelCase. */
export interface EstadisticasPropietario {
  periodo: { desde: FechaISO; hasta: FechaISO };
  kpis: {
    /** De 0 a 1. */
    ocupacion: ValorComparado;
    ingresos: ValorComparado;
    reservas: ValorComparado;
    /** De 0 a 1. */
    tasaCancelacion: ValorComparado;
    ausentes: ValorComparado;
  };
  ocupacionPorDia: { fecha: FechaISO; horasUsadas: number; horasOfrecidas: number }[];
  ingresosPorDia: { fecha: FechaISO; reservas: number; abonos: number }[];
  ingresosProyectados: number;
  /** Reservas que ocupan cada hora. `diaSemana`: 0 = domingo. */
  demanda: { diaSemana: number; hora: number; reservas: number }[];
  horaPico: { diaSemana: number; hora: number } | null;
  cancelaciones: {
    total: number;
    porOrigen: Record<OrigenCancelacionEstadistica, number>;
    anticipacionPromedioHoras: number | null;
  };
  ausentes: { total: number; tasa: number };
}
