import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CambiosVehiculo, Id, NuevoVehiculo, Vehiculo } from '@app/models';
import { VehiculoDto } from './api/api.dto';
import { aPayloadCambiosVehiculo, aPayloadVehiculo, aVehiculo } from './api/api.mapeo';

/** Acceso a `/api/vehiculos` (vehiculos del conductor autenticado). */
@Injectable({ providedIn: 'root' })
export class VehiculoService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/vehiculos';

  /** `GET /api/vehiculos` */
  listarMisVehiculos(): Observable<Vehiculo[]> {
    return this.http
      .get<{ vehiculos: VehiculoDto[] }>(this.ruta)
      .pipe(map(({ vehiculos }) => vehiculos.map(aVehiculo)));
  }

  /**
   * Un vehiculo por id. El backend no expone el detalle, asi que se resuelve
   * sobre la lista del conductor: es la que usa el editor para precargarse.
   */
  obtener(id: Id): Observable<Vehiculo | undefined> {
    return this.listarMisVehiculos().pipe(map((vehiculos) => vehiculos.find((v) => v.id === id)));
  }

  /** `POST /api/vehiculos` */
  crear(datos: NuevoVehiculo): Observable<Vehiculo> {
    return this.http
      .post<{ vehiculo: VehiculoDto }>(this.ruta, aPayloadVehiculo(datos))
      .pipe(map(({ vehiculo }) => aVehiculo(vehiculo)));
  }

  /** `PATCH /api/vehiculos/:id` */
  actualizar(vehiculo: Vehiculo, cambios: CambiosVehiculo): Observable<Vehiculo> {
    return this.http
      .patch<{ vehiculo: VehiculoDto }>(rutaVehiculo(this.ruta, vehiculo), aPayloadCambiosVehiculo(cambios))
      .pipe(map(({ vehiculo }) => aVehiculo(vehiculo)));
  }

  /** `DELETE /api/vehiculos/:id` (baja logica: deja de aparecer en el listado) */
  eliminar(vehiculo: Vehiculo): Observable<Vehiculo> {
    return this.http
      .delete<{ vehiculo: VehiculoDto }>(rutaVehiculo(this.ruta, vehiculo))
      .pipe(map(({ vehiculo }) => aVehiculo(vehiculo)));
  }
}

function rutaVehiculo(base: string, vehiculo: Vehiculo): string {
  return `${base}/${vehiculo.id}`;
}
