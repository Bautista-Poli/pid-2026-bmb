import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CanalIncidencia, Id, Incidencia, IncidenciaDetallada, NuevoReclamo } from '@app/models';
import { IncidenciaDetalladaDto, IncidenciaDto } from './api/api.dto';
import { aIncidencia, aIncidenciaDetallada, aPayloadReclamo } from './api/api.mapeo';

/**
 * Incidencias de reservas con su hilo de mensajes. Las ve el propietario del
 * estacionamiento y el conductor de la reserva. Resolver es del propietario;
 * denunciar, de cualquiera de los dos.
 */
@Injectable({ providedIn: 'root' })
export class IncidenciaService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/incidencias';

  /** `GET /api/incidencias`: abiertas primero. */
  listar(): Observable<Incidencia[]> {
    return this.http
      .get<{ incidencias: IncidenciaDto[] }>(this.ruta)
      .pipe(map(({ incidencias }) => incidencias.map(aIncidencia)));
  }

  /** `GET /api/incidencias/:id`: con todos los mensajes. */
  obtener(id: Id): Observable<IncidenciaDetallada> {
    return this.http
      .get<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/${id}`)
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /**
   * `POST /api/incidencias/:id/mensajes`, en el chat general o en el privado
   * con la moderacion. En un reclamo, el propietario puede sumar una propuesta
   * de devolucion (`montoPropuesto`, solo en el general).
   */
  responder(
    id: Id,
    texto: string,
    canal: CanalIncidencia = 'GENERAL',
    montoPropuesto?: number,
  ): Observable<IncidenciaDetallada> {
    const body = montoPropuesto === undefined ? { texto, canal } : { texto, canal, monto_propuesto: montoPropuesto };
    return this.http
      .post<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/${id}/mensajes`, body)
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /** `PATCH /api/incidencias/:id/resolver` (propietario), con comentario opcional. */
  resolver(id: Id, comentario?: string): Observable<IncidenciaDetallada> {
    return this.http
      .patch<{ incidencia: IncidenciaDetalladaDto }>(
        `${this.ruta}/${id}/resolver`,
        comentario ? { comentario } : {},
      )
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /** `PATCH /api/incidencias/:id/denunciar` (propietario o conductor): la escala a la moderacion. */
  denunciar(id: Id, motivo: string): Observable<IncidenciaDetallada> {
    return this.http
      .patch<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/${id}/denunciar`, { motivo })
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /** `POST /api/incidencias/reclamos` (conductor): abre un reclamo sobre una reserva o un abono. */
  reclamar(datos: NuevoReclamo): Observable<IncidenciaDetallada> {
    return this.http
      .post<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/reclamos`, aPayloadReclamo(datos))
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /**
   * `PATCH /api/incidencias/:id/aceptar` (conductor). `monto` es la propuesta
   * que vio: si el propietario la cambio mientras tanto, la API da 409.
   */
  aceptar(id: Id, monto: number): Observable<IncidenciaDetallada> {
    return this.http
      .patch<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/${id}/aceptar`, { monto })
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }

  /** `PATCH /api/incidencias/:id/retirar` (conductor). */
  retirar(id: Id): Observable<IncidenciaDetallada> {
    return this.http
      .patch<{ incidencia: IncidenciaDetalladaDto }>(`${this.ruta}/${id}/retirar`, {})
      .pipe(map(({ incidencia }) => aIncidenciaDetallada(incidencia)));
  }
}
