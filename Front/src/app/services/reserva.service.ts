import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BORRADOR_VACIO,
  BorradorReserva,
  ConsultaDisponibilidad,
  FechaISO,
  FranjaDisponible,
  HORAS_POR_MODALIDAD,
  Id,
  NuevaReserva,
  Reserva,
  ReservaDetallada,
  Tarifas,
} from '@app/models';
import { duracionEnHoras } from '@app/utils/fecha.util';
import { calcularPrecio } from '@app/utils/tarifa.util';
import { FranjaDto, ReservaDto } from './api/api.dto';
import { ID_TIPO_VEHICULO, aFranja, aPayloadReserva, aReserva } from './api/api.mapeo';

/**
 * Acceso a `/api/reservas` mas el estado del wizard de reserva.
 * El borrador vive en un signal para que los tres pasos del flujo compartan
 * la misma seleccion sin pasarse inputs entre rutas.
 */
@Injectable({ providedIn: 'root' })
export class ReservaService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/reservas';

  private readonly borradorInterno = signal<BorradorReserva>({ ...BORRADOR_VACIO });

  readonly borrador = this.borradorInterno.asReadonly();

  /** Horas del borrador: las elegidas por hora, o el bloque fijo de estadia / jornada. */
  readonly duracionHoras = computed(() => {
    const { modalidad, horaDesde, horaHasta } = this.borradorInterno();
    if (modalidad !== 'HORA') return HORAS_POR_MODALIDAD[modalidad];
    return horaDesde && horaHasta ? duracionEnHoras(horaDesde, horaHasta) : 0;
  });

  readonly borradorCompleto = computed(() => {
    const b = this.borradorInterno();
    const tieneHorario = b.modalidad === 'HORA' ? Boolean(b.horaDesde && b.horaHasta) : Boolean(b.horaDesde);
    return Boolean(b.estacionamientoId && b.vehiculoId && b.fecha && tieneHorario);
  });

  /* ------------------------------ borrador ------------------------------ */

  iniciarBorrador(estacionamientoId: Id): void {
    this.borradorInterno.set({ ...BORRADOR_VACIO, estacionamientoId });
  }

  actualizarBorrador(cambios: Partial<BorradorReserva>): void {
    this.borradorInterno.update((actual) => ({ ...actual, ...cambios }));
  }

  reiniciarBorrador(): void {
    this.borradorInterno.set({ ...BORRADOR_VACIO });
  }

  /** Convierte el borrador en los datos de la nueva reserva. */
  aPayload(): NuevaReserva | null {
    const b = this.borradorInterno();
    if (!this.borradorCompleto() || !b.estacionamientoId || !b.vehiculoId || !b.fecha || !b.horaDesde) {
      return null;
    }
    return {
      estacionamientoId: b.estacionamientoId,
      vehiculoId: b.vehiculoId,
      modalidad: b.modalidad,
      fecha: b.fecha,
      horaDesde: b.horaDesde,
      horaHasta: b.modalidad === 'HORA' ? b.horaHasta : null,
    };
  }

  /* -------------------------------- API --------------------------------- */

  /** `GET /api/estacionamientos/:id/disponibilidad?fecha=YYYY-MM-DD` */
  disponibilidad(consulta: ConsultaDisponibilidad): Observable<FranjaDisponible[]> {
    let params = new HttpParams().set('fecha', consulta.fecha);
    if (consulta.tipoVehiculo) {
      params = params.set('id_tipo_vehiculo', ID_TIPO_VEHICULO[consulta.tipoVehiculo]);
    }

    return this.http
      .get<{ franjas: FranjaDto[] }>(
        `/estacionamientos/${consulta.estacionamientoId}/disponibilidad`,
        { params },
      )
      .pipe(map(({ franjas }) => franjas.map(aFranja)));
  }

  /** `POST /api/reservas` (el backend asigna la cochera) */
  crear(datos: NuevaReserva): Observable<Reserva> {
    return this.http
      .post<{ reserva: ReservaDto }>(this.ruta, aPayloadReserva(datos))
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }

  /** `GET /api/reservas` (reservas del conductor autenticado) */
  listarMisReservas(): Observable<ReservaDetallada[]> {
    return this.http
      .get<{ reservas: ReservaDto[] }>(this.ruta)
      .pipe(map(({ reservas }) => reservas.map(aReserva)));
  }

  /**
   * `GET /api/estacionamientos/:id/reservas[?fecha=YYYY-MM-DD]` (vista del
   * propietario). Con `fecha` resuelve el bloque "Reservas de hoy" del panel.
   */
  listarPorEstacionamiento(estacionamientoId: Id, fecha?: FechaISO): Observable<ReservaDetallada[]> {
    const params = fecha ? new HttpParams().set('fecha', fecha) : undefined;

    return this.http
      .get<{ reservas: ReservaDto[] }>(`/estacionamientos/${estacionamientoId}/reservas`, { params })
      .pipe(map(({ reservas }) => reservas.map(aReserva)));
  }

  /** `PATCH /api/reservas/:id/cancelar` */
  cancelar(id: Id): Observable<Reserva> {
    return this.http
      .patch<{ reserva: ReservaDto }>(`${this.ruta}/${id}/cancelar`, {})
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }

  /**
   * Ciclo que maneja el propietario: confirmar la reserva, registrar que el
   * vehiculo llego y registrar que se fue (eso la finaliza).
   */
  confirmar(id: Id): Observable<Reserva> {
    return this.transicion(id, 'confirmar');
  }

  registrarIngreso(id: Id): Observable<Reserva> {
    return this.transicion(id, 'ingreso');
  }

  registrarEgreso(id: Id): Observable<Reserva> {
    return this.transicion(id, 'egreso');
  }

  private transicion(id: Id, paso: 'confirmar' | 'ingreso' | 'egreso'): Observable<Reserva> {
    return this.http
      .patch<{ reserva: ReservaDto }>(`${this.ruta}/${id}/${paso}`, {})
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }

  /** Precio estimado del borrador segun las tarifas del estacionamiento (el definitivo lo calcula el backend). */
  precioEstimado(tarifas: Tarifas): number {
    return calcularPrecio(this.borradorInterno().modalidad, tarifas, this.duracionHoras());
  }
}
