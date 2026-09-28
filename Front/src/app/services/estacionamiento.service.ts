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
import { estadoDisponibilidad } from '@app/utils/disponibilidad.util';
import { distanciaKm } from '@app/utils/distancia.util';
import { aInstante } from '@app/utils/fecha.util';
import { ID_TIPO_VEHICULO, aEstacionamiento, aPayloadEstacionamiento } from './api/api.mapeo';

/** La API acepta hasta 100 resultados por pagina. */
export const LIMITE_BUSQUEDA = 100;

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
        map((items) => conDistancia(items, filtros.origen)),
        map((items) => ordenarEstacionamientos(items, filtros.orden)),
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

/** Con `origen`, calcula la distancia de cada estacionamiento; si no tiene coordenadas, queda sin distancia. */
function conDistancia(
  items: Estacionamiento[],
  origen: FiltrosEstacionamiento['origen'],
): Estacionamiento[] {
  if (!origen) return items;
  return items.map((estacionamiento) => {
    const { latitud, longitud } = estacionamiento.direccion;
    if (latitud == null || longitud == null) return estacionamiento;
    return { ...estacionamiento, distanciaKm: distanciaKm(origen, { latitud, longitud }) };
  });
}

/**
 * Lo unico que no resuelve la API: el orden elegido. Exportado para reordenar lo
 * que ya llego sin volver a pedirlo.
 */
export function ordenarEstacionamientos(
  items: Estacionamiento[],
  orden: OrdenEstacionamiento | null | undefined,
): Estacionamiento[] {
  const comparar = COMPARADORES[orden ?? 'DISTANCIA'];
  // Los que no se pueden usar van siempre al final, sea cual sea el orden.
  const alFinal = (e: Estacionamiento) => (estadoDisponibilidad(e) === 'NO_DISPONIBLE' ? 1 : 0);
  return [...items].sort((a, b) => alFinal(a) - alFinal(b) || comparar(a, b));
}

function aParams(filtros: FiltrosEstacionamiento): HttpParams {
  let params = new HttpParams().set('limit', LIMITE_BUSQUEDA);
  const busqueda = filtros.busqueda?.trim();
  if (busqueda) params = params.set('q', busqueda);
  const zona = filtros.zona?.trim();
  if (zona) params = params.set('zona', zona);
  if (filtros.tipoVehiculo) {
    params = params.set('id_tipo_vehiculo', ID_TIPO_VEHICULO[filtros.tipoVehiculo]);
  }
  if (filtros.precioMinimo != null) params = params.set('tarifa_min', filtros.precioMinimo);
  if (filtros.precioMaximo != null) params = params.set('tarifa_max', filtros.precioMaximo);
  if (filtros.soloCubiertos) params = params.set('cubierto', true);
  if (filtros.area) {
    params = params
      .set('lat_min', filtros.area.latitudMinima)
      .set('lat_max', filtros.area.latitudMaxima)
      .set('lng_min', filtros.area.longitudMinima)
      .set('lng_max', filtros.area.longitudMaxima);
  }

  const momento = filtros.momento;
  if (momento && filtros.incluirNoDisponibles) params = params.set('incluir_no_disponibles', true);
  if (momento?.tipo === 'AHORA') {
    params = params.set('disponible_ahora', true);
  } else if (momento?.tipo === 'FRANJA') {
    params = params
      .set('inicio', aInstante(momento.fecha, momento.horaDesde))
      .set('fin', aInstante(momento.fecha, momento.horaHasta));
  }
  return params;
}
