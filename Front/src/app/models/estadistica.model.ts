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
    /** Netos: ya descuentan las devoluciones. */
    ingresos: ValorComparado;
    devoluciones: ValorComparado;
    reservas: ValorComparado;
    /** De 0 a 1. */
    tasaCancelacion: ValorComparado;
    ausentes: ValorComparado;
  };
  ocupacionPorDia: { fecha: FechaISO; horasUsadas: number; horasOfrecidas: number }[];
  ingresosPorDia: { fecha: FechaISO; reservas: number; abonos: number; devoluciones: number }[];
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

/** Por que un estacionamiento aparece como problematico en el dashboard del admin. */
export type RazonProblematico = 'CANCELACIONES' | 'RECLAMOS';

export const ETIQUETA_RAZON_PROBLEMATICO: Record<RazonProblematico, string> = {
  CANCELACIONES: 'Cancela mucho',
  RECLAMOS: 'Reclamos',
};

/** Eventos de cocheras bloqueadas (por un auto que se excedio) en el periodo. */
export interface BloqueosAdmin {
  reasignadas: number;
  canceladas: number;
  autosExcedidos: number;
  sinCochera: number;
}

/** `GET /api/admin/estadisticas`. La API ya responde en camelCase. */
export interface EstadisticasAdmin {
  periodo: { desde: FechaISO; hasta: FechaISO };
  /** Cola actual de revision (no depende del periodo). */
  pendientes: {
    enCola: number;
    masAntiguoDesde: string | null;
    primeros: { id: string; nombre: string; propietario: string; enviadoEn: string }[];
    rechazadosSinReenviar: number;
  };
  /** Incidencias denunciadas, y reclamos que siguen entre las partes. */
  disputas: {
    denunciadas: number;
    masAntiguaDesde: string | null;
    primeras: { id: string; tipo: string; motivo: string | null; estacionamiento: string; denunciadaEn: string }[];
    reclamosEnConversacion: number;
  };
  conflictos: {
    bloqueos: BloqueosAdmin & { porEstacionamiento: (BloqueosAdmin & { id: string; nombre: string })[] };
    problematicos: {
      id: string;
      nombre: string;
      propietario: string;
      reservas: number;
      /** De 0 a 1: canceladas por el estacionamiento o el sistema. */
      tasaCancelacion: number;
      reclamos: number;
      razones: RazonProblematico[];
    }[];
  };
  actividad: {
    kpis: {
      conductoresNuevos: ValorComparado;
      propietariosNuevos: ValorComparado;
      estacionamientosAprobados: ValorComparado;
      reservas: ValorComparado;
      /** Netos de devoluciones. */
      volumen: ValorComparado;
      devoluciones: ValorComparado;
      /** De 0 a 1. */
      tasaCancelacion: ValorComparado;
    };
    reservasPorDia: {
      fecha: FechaISO;
      finalizadas: number;
      enCurso: number;
      confirmadas: number;
      pendientes: number;
      canceladas: number;
      ausentes: number;
    }[];
    topPorReservas: { id: string; nombre: string; valor: number }[];
    topPorIngresos: { id: string; nombre: string; valor: number }[];
  };
}
