import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CalificacionesRecibidas, Id, NuevaCalificacion } from '@app/models';
import { CalificacionesRecibidasDto } from './api/api.dto';
import { aCalificacionesRecibidas } from './api/api.mapeo';

/** Calificaciones: calificar una reserva y ver lo recibido. */
@Injectable({ providedIn: 'root' })
export class CalificacionService {
  private readonly http = inject(HttpClient);

  /** `POST /api/reservas/:id/calificacion`: el lado lo decide el perfil activo. */
  calificar(idReserva: Id, datos: NuevaCalificacion): Observable<void> {
    return this.http.post(`/reservas/${idReserva}/calificacion`, datos).pipe(map(() => undefined));
  }

  /** `GET /api/calificaciones/recibidas`: lo que los propietarios le pusieron al conductor. */
  recibidasComoConductor(limite = 50): Observable<CalificacionesRecibidas> {
    return this.http
      .get<CalificacionesRecibidasDto>('/calificaciones/recibidas', { params: new HttpParams().set('limit', limite) })
      .pipe(map(aCalificacionesRecibidas));
  }

  /** `GET /api/estacionamientos/:id/calificaciones`: solo para el dueno. */
  recibidasPorEstacionamiento(id: Id, limite = 50): Observable<CalificacionesRecibidas> {
    return this.http
      .get<CalificacionesRecibidasDto>(`/estacionamientos/${id}/calificaciones`, {
        params: new HttpParams().set('limit', limite),
      })
      .pipe(map(aCalificacionesRecibidas));
  }
}
