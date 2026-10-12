import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EstacionamientoEnRevision, EstadoAprobacion, Id } from '@app/models';
import { EstacionamientoEnRevisionDto } from './api/api.dto';
import { aEstacionamiento } from './api/api.mapeo';

function aEnRevision(dto: EstacionamientoEnRevisionDto): EstacionamientoEnRevision {
  return { ...aEstacionamiento(dto), propietario: dto.propietario };
}

/** Acceso a `/api/admin`: revision de estacionamientos por el administrador. */
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

  /** `PATCH /api/admin/estacionamientos/:id/aprobar` */
  aprobar(id: Id): Observable<EstacionamientoEnRevision> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoEnRevisionDto }>(`${this.ruta}/${id}/aprobar`, {})
      .pipe(map(({ estacionamiento }) => aEnRevision(estacionamiento)));
  }

  /** `PATCH /api/admin/estacionamientos/:id/rechazar` */
  rechazar(id: Id, motivo: string): Observable<EstacionamientoEnRevision> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoEnRevisionDto }>(`${this.ruta}/${id}/rechazar`, { motivo })
      .pipe(map(({ estacionamiento }) => aEnRevision(estacionamiento)));
  }
}
