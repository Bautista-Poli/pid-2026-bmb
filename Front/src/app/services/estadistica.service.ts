import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { EstadisticasPropietario, FechaISO, Id } from '@app/models';

export interface FiltroEstadisticas {
  desde: FechaISO;
  hasta: FechaISO;
  /** Uno solo, o todos los del propietario si no viene. */
  estacionamientoId?: Id | null;
}

/** Acceso a `/api/estadisticas`. */
@Injectable({ providedIn: 'root' })
export class EstadisticaService {
  private readonly http = inject(HttpClient);

  /** `GET /api/estadisticas/propietario` */
  delPropietario({ desde, hasta, estacionamientoId }: FiltroEstadisticas): Observable<EstadisticasPropietario> {
    const params: Record<string, string> = { desde, hasta };
    if (estacionamientoId) params['id_estacionamiento'] = estacionamientoId;
    return this.http.get<EstadisticasPropietario>('/estadisticas/propietario', { params });
  }
}
