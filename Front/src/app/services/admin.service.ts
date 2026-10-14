import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  EstacionamientoEnRevision,
  EstadoAprobacion,
  EstadisticasAdmin,
  EstadoIncidencia,
  FechaISO,
  FechaHoraISO,
  Id,
  Incidencia,
  IncidenciaModerada,
  ResolucionIncidencia,
} from '@app/models';
import { EstacionamientoEnRevisionDto, IncidenciaDto, IncidenciaModeradaDto } from './api/api.dto';
import { aEstacionamiento, aIncidencia, aIncidenciaModerada } from './api/api.mapeo';

function aEnRevision(dto: EstacionamientoEnRevisionDto): EstacionamientoEnRevision {
  return { ...aEstacionamiento(dto), propietario: dto.propietario };
}

/** Acceso a `/api/admin`: revision de estacionamientos y moderacion de incidencias. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/admin/estacionamientos';

  /** `GET /api/admin/estacionamientos?estado=`. El que espera hace mas, primero. */
  listarEstacionamientos(estado: EstadoAprobacion): Observable<EstacionamientoEnRevision[]> {
    return this.http
      .get<{ estacionamientos: EstacionamientoEnRevisionDto[] }>(this.ruta, { params: { estado } })
      .pipe(map(({ estacionamientos }) => estacionamientos.map(aEnRevision)));
  }

  /** `GET /api/admin/estacionamientos/:id` */
  obtenerEstacionamiento(id: Id): Observable<EstacionamientoEnRevision> {
    return this.http
      .get<{ estacionamiento: EstacionamientoEnRevisionDto }>(`${this.ruta}/${id}`)
      .pipe(map(({ estacionamiento }) => aEnRevision(estacionamiento)));
  }

  /**
   * `PATCH /api/admin/estacionamientos/:id/aprobar`. `enviadoEn` es la version
   * que se reviso: si el propietario la cambio mientras tanto, la API da 409.
   */
  aprobar(id: Id, enviadoEn: FechaHoraISO): Observable<EstacionamientoEnRevision> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoEnRevisionDto }>(`${this.ruta}/${id}/aprobar`, {
        enviado_en: enviadoEn,
      })
      .pipe(map(({ estacionamiento }) => aEnRevision(estacionamiento)));
  }

  /** `PATCH /api/admin/estacionamientos/:id/rechazar` */
  rechazar(id: Id, motivo: string, enviadoEn: FechaHoraISO): Observable<EstacionamientoEnRevision> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoEnRevisionDto }>(`${this.ruta}/${id}/rechazar`, {
        motivo,
        enviado_en: enviadoEn,
      })
      .pipe(map(({ estacionamiento }) => aEnRevision(estacionamiento)));
  }

  /** `GET /api/admin/incidencias?estado=`: por defecto las denunciadas, la mas vieja primero. */
  incidencias(estado: EstadoIncidencia = 'DENUNCIADA'): Observable<Incidencia[]> {
    return this.http
      .get<{ incidencias: IncidenciaDto[] }>('/admin/incidencias', { params: { estado } })
      .pipe(map(({ incidencias }) => incidencias.map(aIncidencia)));
  }

  /** `GET /api/admin/incidencias/:id`: los tres chats y el resumen. */
  incidencia(id: Id): Observable<IncidenciaModerada> {
    return this.http
      .get<{ incidencia: IncidenciaModeradaDto }>(`/admin/incidencias/${id}`)
      .pipe(map(({ incidencia }) => aIncidenciaModerada(incidencia)));
  }

  /** `POST /api/admin/incidencias/:id/mensajes`: solo en los chats privados con cada parte. */
  escribir(id: Id, texto: string, canal: 'PROPIETARIO' | 'CONDUCTOR'): Observable<IncidenciaModerada> {
    return this.http
      .post<{ incidencia: IncidenciaModeradaDto }>(`/admin/incidencias/${id}/mensajes`, { texto, canal })
      .pipe(map(({ incidencia }) => aIncidenciaModerada(incidencia)));
  }

  /** `PATCH /api/admin/incidencias/:id/resolver`: a favor del conductor lleva el monto a devolver. */
  resolverIncidencia(
    id: Id,
    datos: { resolucion: ResolucionIncidencia; monto?: number; fundamento: string },
  ): Observable<IncidenciaModerada> {
    return this.http
      .patch<{ incidencia: IncidenciaModeradaDto }>(`/admin/incidencias/${id}/resolver`, datos)
      .pipe(map(({ incidencia }) => aIncidenciaModerada(incidencia)));
  }

  /** `GET /api/admin/estadisticas`: para revisar, conflictos y actividad del periodo. */
  estadisticas(desde: FechaISO, hasta: FechaISO): Observable<EstadisticasAdmin> {
    return this.http
      .get<{ estadisticas: EstadisticasAdmin }>('/admin/estadisticas', { params: { desde, hasta } })
      .pipe(map(({ estadisticas }) => estadisticas));
  }
}
