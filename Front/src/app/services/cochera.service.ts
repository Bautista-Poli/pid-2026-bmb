import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Cochera, EstadoCochera, Id, NuevaCochera, NuevoLoteCocheras } from '@app/models';
import { CocheraDto } from './api/api.dto';
import { aCochera, aPayloadCambiosCochera, aPayloadCochera, aPayloadLoteCochera } from './api/api.mapeo';

/** Cocheras de un estacionamiento: `/api/estacionamientos/:id/cocheras`. */
@Injectable({ providedIn: 'root' })
export class CocheraService {
  private readonly http = inject(HttpClient);

  /** `GET /api/estacionamientos/:id/cocheras` */
  listarPorEstacionamiento(estacionamientoId: Id): Observable<Cochera[]> {
    return this.http
      .get<{ cocheras: CocheraDto[] }>(rutaCocheras(estacionamientoId))
      .pipe(map(({ cocheras }) => cocheras.map(aCochera)));
  }

  /** `POST /api/estacionamientos/:id/cocheras` */
  crear(datos: NuevaCochera): Observable<Cochera> {
    return this.http
      .post<{ cochera: CocheraDto }>(rutaCocheras(datos.estacionamientoId), aPayloadCochera(datos))
      .pipe(map((respuesta) => aCochera(respuesta.cochera)));
  }

  /** `POST /api/estacionamientos/:id/cocheras/lote` */
  crearLote(datos: NuevoLoteCocheras): Observable<Cochera[]> {
    return this.http
      .post<{ cocheras: CocheraDto[] }>(
        `${rutaCocheras(datos.estacionamientoId)}/lote`,
        aPayloadLoteCochera(datos),
      )
      .pipe(map((respuesta) => respuesta.cocheras.map(aCochera)));
  }

  /** `PATCH /api/estacionamientos/:id/cocheras/:idCochera` */
  actualizar(cochera: Cochera, cambios: Partial<NuevaCochera>): Observable<Cochera> {
    return this.http
      .patch<{ cochera: CocheraDto }>(rutaCochera(cochera), aPayloadCambiosCochera(cambios))
      .pipe(map((respuesta) => aCochera(respuesta.cochera)));
  }

  cambiarEstado(cochera: Cochera, estado: EstadoCochera): Observable<Cochera> {
    return this.actualizar(cochera, { estado });
  }

  /** `DELETE /api/estacionamientos/:id/cocheras/:idCochera` (baja logica) */
  darDeBaja(cochera: Cochera): Observable<Cochera> {
    return this.http
      .delete<{ cochera: CocheraDto }>(rutaCochera(cochera))
      .pipe(map((respuesta) => aCochera(respuesta.cochera)));
  }
}

function rutaCocheras(estacionamientoId: Id): string {
  return `/estacionamientos/${estacionamientoId}/cocheras`;
}

function rutaCochera(cochera: Cochera): string {
  return `${rutaCocheras(cochera.estacionamientoId)}/${cochera.id}`;
}
