import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import {
  AccesoReserva,
  ConsultaDisponibilidad,
  FechaISO,
  FranjaDisponible,
  Id,
  NuevaReserva,
  NuevaReservaConAbono,
  Reserva,
  ReservaDetallada,
  Vehiculo,
} from '@app/models';
import { AccesoReservaDto, FranjaDto, ReservaDto } from './api/api.dto';
import { ID_TIPO_VEHICULO, aAccesoReserva, aFranja, aPayloadReserva, aPayloadReservaConAbono, aReserva } from './api/api.mapeo';

/** Acceso a `/api/reservas`: disponibilidad, alta, listados y el ciclo de la reserva. */
@Injectable({ providedIn: 'root' })
export class ReservaService {
  
  private readonly http = inject(HttpClient);
  private readonly ruta = '/reservas';

  /** `GET /api/estacionamientos/:id/disponibilidad?fecha=YYYY-MM-DD` */
  disponibilidad(consulta: ConsultaDisponibilidad): Observable<FranjaDisponible[]> {
    let params = new HttpParams().set('fecha', consulta.fecha);
    if (consulta.tipoVehiculo) {
      params = params.set('id_tipo_vehiculo', ID_TIPO_VEHICULO[consulta.tipoVehiculo]);
    }
    if (consulta.modalidad) params = params.set('modalidad', consulta.modalidad);
    if (consulta.horas) params = params.set('horas', consulta.horas);

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

  /** `POST /api/reservas` con `id_abono`: gratis, dentro del turno del abono. */
  crearConAbono(datos: NuevaReservaConAbono): Observable<Reserva> {
    return this.http
      .post<{ reserva: ReservaDto }>(this.ruta, aPayloadReservaConAbono(datos))
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

  /**
   * Todas las reservas de varios estacionamientos juntas (un pedido por cada
   * uno). Es lo que usan el panel y la bandeja de reservas del propietario.
   */
  listarDeEstacionamientos(ids: Id[], fecha?: FechaISO): Observable<ReservaDetallada[]> {
    if (ids.length === 0) return of([]);
    return forkJoin(ids.map((id) => this.listarPorEstacionamiento(id, fecha))).pipe(
      map((listas) => listas.flat()),
    );
  }

  /** `PATCH /api/reservas/:id/cancelar` */
  cancelar(id: Id): Observable<Reserva> {
    return this.http
      .patch<{ reserva: ReservaDto }>(`${this.ruta}/${id}/cancelar`, {})
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }

  /**
   * Ciclo que maneja el propietario: confirmar la reserva. El ingreso y el
   * egreso solo se registran con el codigo (ver `registrarAcceso`).
   */
  confirmar(id: Id): Observable<Reserva> {
    return this.transicion(id, 'confirmar');
  }

  /** `PATCH /api/reservas/:id/ausente`: no-show a mano, si el conductor avisó que no viene. */
  marcarAusente(id: Id): Observable<Reserva> {
    return this.transicion(id, 'ausente');
  }

  /** `GET /api/reservas/acceso/:codigo`: que registraria el QR, sin registrar nada. */
  previaAcceso(codigo: string): Observable<AccesoReserva> {
    return this.http.get<AccesoReservaDto>(`${this.ruta}/acceso/${codigo}`).pipe(map(aAccesoReserva));
  }

  /** `POST /api/reservas/acceso`: registra el ingreso o el egreso de esa reserva. */
  registrarAcceso(codigo: string): Observable<AccesoReserva> {
    return this.http
      .post<AccesoReservaDto>(`${this.ruta}/acceso`, { codigo })
      .pipe(map(aAccesoReserva));
  }

  private transicion(id: Id, paso: 'confirmar' | 'ausente'): Observable<Reserva> {
    return this.http
      .patch<{ reserva: ReservaDto }>(`${this.ruta}/${id}/${paso}`, {})
      .pipe(map(({ reserva }) => aReserva(reserva)));
  }
  // /api/reservas/:idReserva/cambiarVehiculo
  cambiarVehiculo(idVehiculo: any, idReserva: any) {
    return this.http
      .patch<void>(`${this.ruta}/${idReserva}/cambiarVehiculo`, {idVehiculo})
    
  }
}
