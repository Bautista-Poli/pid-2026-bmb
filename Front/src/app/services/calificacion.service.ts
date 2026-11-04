import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Calificacion,
  Id,
  NuevaCalificacion,
  NuevaCalificacionConductor,
  PeriodoReputacion,
  ReputacionConductor,
  ReputacionEstacionamiento,
} from '@app/models';
import { CalificacionDto, ReputacionDto } from './api/api.dto';
import { aCalificacion, aReputacion } from './api/api.mapeo';

/** Calificaciones del conductor y reputacion del estacionamiento. */
@Injectable({ providedIn: 'root' })
export class CalificacionService {
  private readonly http = inject(HttpClient);

  /** `POST /api/reservas/:id/calificacion`: solo despues de entrar y salir, una vez. */
  calificar(reservaId: Id, datos: NuevaCalificacion): Observable<Calificacion> {
    const comentario = datos.comentario.trim();
    return this.http
      .post<{ calificacion: CalificacionDto }>(`/reservas/${reservaId}/calificacion`, {
        ...datos.notas,
        etiquetas: datos.etiquetas,
        ...(comentario ? { comentario } : {}),
      })
      .pipe(map(({ calificacion }) => aCalificacion(calificacion)));
  }

  /** `POST /api/reservas/:id/calificacion-conductor` (propietario): finalizada o ausente, una vez. */
  calificarConductor(reservaId: Id, datos: NuevaCalificacionConductor): Observable<void> {
    const comentario = datos.comentario.trim();
    return this.http
      .post<unknown>(`/reservas/${reservaId}/calificacion-conductor`, {
        puntaje: datos.puntaje,
        etiquetas: datos.etiquetas,
        ...(comentario ? { comentario } : {}),
      })
      .pipe(map(() => undefined));
  }

  /** `GET /api/reservas/mi-reputacion` (conductor): lo que le pusieron los propietarios. */
  miReputacion(): Observable<ReputacionConductor> {
    return this.http
      .get<{ reputacion: ReputacionConductor }>('/reservas/mi-reputacion')
      .pipe(map(({ reputacion }) => reputacion));
  }

  /** `GET /api/estacionamientos/:id/reputacion?dias=30|90` (propietario). */
  reputacion(estacionamientoId: Id, dias: PeriodoReputacion): Observable<ReputacionEstacionamiento> {
    return this.http
      .get<ReputacionDto>(`/estacionamientos/${estacionamientoId}/reputacion`, { params: { dias } })
      .pipe(map(aReputacion));
  }
}
