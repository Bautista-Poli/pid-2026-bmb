import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Estacionamiento,
  FiltrosEstacionamiento,
  Id,
  NuevoEstacionamiento,
  OrdenEstacionamiento,
} from '@app/models';
import { EstacionamientoDto } from './api/api.dto';
import { ID_TIPO_VEHICULO, aEstacionamiento, aPayloadEstacionamiento } from './api/api.mapeo';

/** La API acepta hasta 100 resultados por pagina. */
const LIMITE_BUSQUEDA = 100;

/** Acceso a `/api/estacionamientos`. */
@Injectable({ providedIn: 'root' })
export class EstacionamientoService {
  private readonly http = inject(HttpClient);
  private readonly ruta = '/estacionamientos';

  /** `GET /api/estacionamientos` */
  listar(filtros: FiltrosEstacionamiento = {}): Observable<Estacionamiento[]> {
    return this.http
      .get<{ estacionamientos: EstacionamientoDto[] }>(this.ruta, { params: aParams(filtros) })
      .pipe(
        map(({ estacionamientos }) => estacionamientos.map(aEstacionamiento)),
        map((items) => aplicarFiltrosLocales(items, filtros)),
      );
  }

  /** `GET /api/estacionamientos/:id` */
  obtener(id: Id): Observable<Estacionamiento> {
    return this.http
      .get<{ estacionamiento: EstacionamientoDto }>(`${this.ruta}/${id}`)
      .pipe(map(({ estacionamiento }) => aEstacionamiento(estacionamiento)));
  }

  /** `GET /api/estacionamientos/mios`. La API toma el propietario del token. */
  listarDelPropietario(): Observable<Estacionamiento[]> {
    return this.http
      .get<{ estacionamientos: EstacionamientoDto[] }>(`${this.ruta}/mios`)
      .pipe(map(({ estacionamientos }) => estacionamientos.map(aEstacionamiento)));
  }

  /** `POST /api/estacionamientos` */
  crear(datos: NuevoEstacionamiento): Observable<Estacionamiento> {
    return this.http
      .post<{ estacionamiento: EstacionamientoDto }>(this.ruta, aPayloadEstacionamiento(datos))
      .pipe(map(({ estacionamiento }) => aEstacionamiento(estacionamiento)));
  }

  /** `PATCH /api/estacionamientos/:id`. Manda el formulario completo. */
  actualizar(id: Id, datos: NuevoEstacionamiento): Observable<Estacionamiento> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoDto }>(
        `${this.ruta}/${id}`,
        aPayloadEstacionamiento(datos),
      )
      .pipe(map(({ estacionamiento }) => aEstacionamiento(estacionamiento)));
  }

  /** `PATCH /api/estacionamientos/:id` solo con la publicacion. */
  cambiarPublicacion(id: Id, publicado: boolean): Observable<Estacionamiento> {
    return this.http
      .patch<{ estacionamiento: EstacionamientoDto }>(`${this.ruta}/${id}`, { publicado })
      .pipe(map(({ estacionamiento }) => aEstacionamiento(estacionamiento)));
  }

  /** `DELETE /api/estacionamientos/:id` (baja logica en cascada). */
  darDeBaja(id: Id): Observable<Estacionamiento> {
    return this.http
      .delete<{ estacionamiento: EstacionamientoDto }>(`${this.ruta}/${id}`)
      .pipe(map(({ estacionamiento }) => aEstacionamiento(estacionamiento)));
  }

  /**
   * `PUT /api/estacionamientos/:id/foto`
   *
   * El body es el archivo crudo: `HttpClient` manda el `File` tal cual y usa su
   * `type` como Content-Type, que es lo que espera el `express.raw()` de la API.
   */
  subirFoto(id: Id, archivo: File): Observable<void> {
    return this.http.put<void>(`${this.ruta}/${id}/foto`, archivo);
  }

  /** `DELETE /api/estacionamientos/:id/foto` */
  borrarFoto(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.ruta}/${id}/foto`);
  }
}

/* --------------------------- helpers de filtrado --------------------------- */

const distancia = (estacionamiento: Estacionamiento) =>
  estacionamiento.distanciaKm ?? Number.MAX_VALUE;

const COMPARADORES: Record<OrdenEstacionamiento, (a: Estacionamiento, b: Estacionamiento) => number> =
  {
    DISTANCIA: (a, b) => distancia(a) - distancia(b),
    PRECIO: (a, b) =>
      (a.tarifas.hora ?? Number.MAX_VALUE) - (b.tarifas.hora ?? Number.MAX_VALUE),
  };

/** Lo que la API no resuelve: solo con lugar libre, y el orden elegido. */
function aplicarFiltrosLocales(
  items: Estacionamiento[],
  filtros: FiltrosEstacionamiento,
): Estacionamiento[] {
  const visibles = filtros.soloDisponibles
    ? items.filter((est) => est.cocherasDisponibles > 0)
    : items;
  return [...visibles].sort(COMPARADORES[filtros.orden ?? 'DISTANCIA']);
}

function aParams(filtros: FiltrosEstacionamiento): HttpParams {
  let params = new HttpParams().set('limit', LIMITE_BUSQUEDA);
  const busqueda = filtros.busqueda?.trim();
  if (busqueda) params = params.set('q', busqueda);
  if (filtros.tipoVehiculo) {
    params = params.set('id_tipo_vehiculo', ID_TIPO_VEHICULO[filtros.tipoVehiculo]);
  }
  if (filtros.precioMaximo != null) params = params.set('tarifa_max', filtros.precioMaximo);
  if (filtros.soloCubiertos) params = params.set('cubierto', true);
  return params;
}
