import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import { Cochera, EstadoCochera, Id, LoteCocheras, NuevaCochera } from '@app/models';
import { CocheraDto } from './api/api.dto';
import { aCochera, aPayloadCambiosCochera, aPayloadCochera, aPayloadLotes } from './api/api.mapeo';
import { COCHERAS_MOCK } from './mocks/datos-mock';
import { clonar, simular } from './mocks/mock.util';

/** Cocheras de un estacionamiento: `/api/estacionamientos/:id/cocheras`. */
@Injectable({ providedIn: 'root' })
export class CocheraService {
  private readonly http = inject(HttpClient);

  /** `GET /api/estacionamientos/:id/cocheras` */
  listarPorEstacionamiento(estacionamientoId: Id): Observable<Cochera[]> {
    if (environment.usarMocks) {
      return simular(clonar(COCHERAS_MOCK.filter((c) => c.estacionamientoId === estacionamientoId)));
    }

    return this.http
      .get<{ cocheras: CocheraDto[] }>(rutaCocheras(estacionamientoId))
      .pipe(map(({ cocheras }) => cocheras.map(aCochera)));
  }

  /** `POST /api/estacionamientos/:id/cocheras` */
  crear(datos: NuevaCochera): Observable<Cochera> {
    if (environment.usarMocks) {
      return simular<Cochera>({
        id: `coc-${crypto.randomUUID()}`,
        estacionamientoId: datos.estacionamientoId,
        identificador: datos.identificador,
        sector: datos.sector ?? '',
        tipoVehiculo: datos.tipoVehiculo,
        cubierta: datos.cubierta ?? false,
        estado: datos.estado ?? 'LIBRE',
      });
    }

    return this.http
      .post<{ cochera: CocheraDto }>(rutaCocheras(datos.estacionamientoId), aPayloadCochera(datos))
      .pipe(map((respuesta) => aCochera(respuesta.cochera)));
  }

  /** `POST /api/estacionamientos/:id/cocheras/lote` (todo o nada) */
  crearLote(estacionamientoId: Id, lotes: LoteCocheras[]): Observable<Cochera[]> {
    if (environment.usarMocks) {
      return simular<Cochera[]>(
        lotes.flatMap((lote) =>
          Array.from({ length: lote.cantidad }, (_, i) => ({
            id: `coc-${crypto.randomUUID()}`,
            estacionamientoId,
            identificador: `${lote.prefijo}-${i + 1}`,
            sector: lote.sector,
            tipoVehiculo: lote.tipoVehiculo,
            cubierta: lote.cubierta,
            estado: 'LIBRE' as const,
          })),
        ),
      );
    }

    return this.http
      .post<{ cocheras: CocheraDto[] }>(`${rutaCocheras(estacionamientoId)}/lote`, aPayloadLotes(lotes))
      .pipe(map(({ cocheras }) => cocheras.map(aCochera)));
  }

  /** `PATCH /api/estacionamientos/:id/cocheras/:idCochera` */
  actualizar(cochera: Cochera, cambios: Partial<NuevaCochera>): Observable<Cochera> {
    if (environment.usarMocks) {
      return simular<Cochera>({
        ...clonar(cochera),
        identificador: cambios.identificador ?? cochera.identificador,
        sector: cambios.sector ?? cochera.sector,
        tipoVehiculo: cambios.tipoVehiculo ?? cochera.tipoVehiculo,
        cubierta: cambios.cubierta ?? cochera.cubierta,
        estado: cambios.estado ?? cochera.estado,
      });
    }

    return this.http
      .patch<{ cochera: CocheraDto }>(rutaCochera(cochera), aPayloadCambiosCochera(cambios))
      .pipe(map((respuesta) => aCochera(respuesta.cochera)));
  }

  cambiarEstado(cochera: Cochera, estado: EstadoCochera): Observable<Cochera> {
    return this.actualizar(cochera, { estado });
  }

  /** `DELETE /api/estacionamientos/:id/cocheras/:idCochera` (baja logica) */
  darDeBaja(cochera: Cochera): Observable<Cochera> {
    if (environment.usarMocks) {
      return simular<Cochera>({ ...clonar(cochera), estado: 'INACTIVA' });
    }

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
