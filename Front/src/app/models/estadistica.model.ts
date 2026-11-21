import { FechaISO } from './api.model';
import { OrigenCancelacion } from './reserva.model';

/** Un valor del periodo y el del periodo anterior de igual largo. */
interface ValorComparado {
  valor: number;
  anterior: number;
}

/** Como `OrigenCancelacion`, mas las canceladas antes de que se guardara el dato. */
export type OrigenCancelacionEstadistica = OrigenCancelacion | 'SIN_DATO';

export const ETIQUETA_ORIGEN_CANCELACION: Record<OrigenCancelacionEstadistica, string> = {
  CONDUCTOR: 'El conductor',
  PROPIETARIO: 'El estacionamiento',
  SISTEMA: 'Expiradas sin confirmar',
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

/** Reservas reasignadas o canceladas por cocheras bloqueadas en el periodo. */
interface BloqueosAdmin {
  reasignadas: number;
  canceladas: number;
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
  conflictos: {
    bloqueos: BloqueosAdmin & { porEstacionamiento: (BloqueosAdmin & { id: string; nombre: string })[] };
    problematicos: {
      id: string;
      nombre: string;
      propietario: string;
      reservas: number;
      /** De 0 a 1: canceladas por el estacionamiento o el sistema. */
      tasaCancelacion: number;
    }[];
  };
  actividad: {
    kpis: {
      conductoresNuevos: ValorComparado;
      propietariosNuevos: ValorComparado;
      estacionamientosAprobados: ValorComparado;
      reservas: ValorComparado;
      volumen: ValorComparado;
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
