import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Coordenadas } from '@app/utils/distancia.util';
import { Observable, expand, map, of, reduce, shareReplay } from 'rxjs';

/**
 * Georef: API oficial de direcciones de Argentina (datos.gob.ar). Se llama
 * directo desde el navegador (permite CORS y no pide clave). El backend valida
 * contra la misma fuente, asi que lo que se elige aca despues se encuentra alla.
 *
 * Su filtro `nombre` busca palabras completas ("ros" no encuentra Rosario), asi
 * que no sirve para autocompletar letra por letra. En cambio se baja la lista
 * entera de ciudades de la provincia, o de calles de la ciudad, una sola vez
 * (50-300 KB) y se filtra en el navegador.
 */
const GEOREF = 'https://apis.datos.gob.ar/georef/api';
/** Georef devuelve como maximo 5000 filas por pagina. */
const POR_PAGINA = 5000;
/** Tope de ciudades por busqueda de destino (Georef acepta hasta 1000 consultas por pedido). */
const MAX_ZONAS = 25;

export interface LugarGeoref {
  id: string;
  nombre: string;
  /** Para distinguir homonimos: el departamento o partido. */
  detalle?: string;
}

/** Una direccion concreta (calle y altura) con su ubicacion: el destino del conductor. */
export interface DireccionGeoref {
  /** "Av Pueyrredon 2409" */
  nombre: string;
  /** "Comuna 2, CABA" o "Rosario, Santa Fe" */
  detalle: string;
  coordenadas: Coordenadas;
}

/** Donde buscar un destino: una ciudad (localidad censal) y su provincia. */
export interface ZonaBusqueda {
  ciudad: string;
  provincia: string;
}

interface DireccionDto {
  calle: { nombre: string };
  altura: { valor: number | null };
  departamento: { nombre: string | null };
  localidad_censal: { nombre: string | null };
  provincia: { nombre: string };
  ubicacion: { lat: number | null; lon: number | null } | null;
}

interface Pagina {
  total: number;
  inicio: number;
  cantidad: number;
  [coleccion: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class GeorefService {
  private readonly http = inject(HttpClient);
  private readonly ciudades = new Map<string, Observable<LugarGeoref[]>>();
  private readonly calles = new Map<string, Observable<LugarGeoref[]>>();

  /** Las 24 provincias, ordenadas por nombre. */
  readonly provincias$: Observable<LugarGeoref[]> = this.todas<{ id: string; nombre: string }>(
    'provincias',
    { campos: 'id,nombre', orden: 'nombre' },
  ).pipe(shareReplay(1));

  /** Todas las ciudades (localidades censales) de una provincia. En CABA hay una sola. */
  ciudadesDe(provinciaId: string): Observable<LugarGeoref[]> {
    return enCache(this.ciudades, provinciaId, () =>
      this.todas<{ id: string; nombre: string; departamento?: { nombre: string | null } }>(
        'localidades-censales',
        { provincia: provinciaId, campos: 'id,nombre,departamento.nombre', orden: 'nombre' },
      ).pipe(
        map((ciudades) =>
          ciudades.map(({ id, nombre, departamento }) => ({
            id,
            nombre,
            detalle:
              departamento?.nombre && normalizar(departamento.nombre) !== normalizar(nombre)
                ? departamento.nombre
                : undefined,
          })),
        ),
      ),
    );
  }

  /**
   * Todas las calles de una ciudad, sin repetidas: Georef devuelve una fila por
   * tramo (en CABA, una por comuna).
   */
  callesDe(ciudadId: string): Observable<LugarGeoref[]> {
    return enCache(this.calles, ciudadId, () =>
      this.todas<{ id: string; nombre: string }>('calles', {
        localidad_censal: ciudadId,
        campos: 'id,nombre',
      }).pipe(
        map((calles) => {
          const vistas = new Set<string>();
          return calles
            .filter(({ nombre }) => !vistas.has(nombre) && vistas.add(nombre))
            .map(({ id, nombre }) => ({ id, nombre: nombrePropio(nombre) }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        }),
      ),
    );
  }

  /**
   * Direcciones que coinciden con `texto` ("pueyrredon 2409"). Sin ciudad,
   * Georef devuelve la misma altura en decenas de ciudades del pais, asi que se
   * busca solo en las `zonas` indicadas (donde hay estacionamientos), todas en
   * un unico pedido. Sin zonas, busca en todo el pais.
   * Solo devuelve direcciones con altura y ubicacion: sin ellas no hay distancia.
   */
  buscarDestinos(texto: string, zonas: ZonaBusqueda[]): Observable<DireccionGeoref[]> {
    const campos =
      'calle.nombre,altura.valor,departamento.nombre,localidad_censal.nombre,provincia.nombre,ubicacion';
    const consultas = zonas.slice(0, MAX_ZONAS).map(({ ciudad, provincia }) => ({
      direccion: texto,
      localidad_censal: ciudad,
      provincia,
      max: 5,
      campos,
    }));

    const respuesta$ =
      consultas.length > 0
        ? this.http
            .post<{ resultados: { direcciones: DireccionDto[] }[] }>(`${GEOREF}/direcciones`, {
              direcciones: consultas,
            })
            .pipe(map(({ resultados }) => resultados.flatMap((r) => r.direcciones)))
        : this.http
            .get<{ direcciones: DireccionDto[] }>(`${GEOREF}/direcciones`, {
              params: { direccion: texto, max: 10, campos },
            })
            .pipe(map(({ direcciones }) => direcciones));

    return respuesta$.pipe(
      map((direcciones) => {
        const vistas = new Set<string>();
        const destinos: DireccionGeoref[] = [];
        for (const d of direcciones) {
          if (d.altura.valor == null || d.ubicacion?.lat == null || d.ubicacion.lon == null) continue;
          const destino = {
            nombre: `${nombrePropio(d.calle.nombre)} ${d.altura.valor}`,
            detalle: detalleDeDireccion(d),
            coordenadas: { latitud: d.ubicacion.lat, longitud: d.ubicacion.lon },
          };
          const clave = `${destino.nombre}|${destino.detalle}`;
          if (vistas.has(clave)) continue;
          vistas.add(clave);
          destinos.push(destino);
        }
        return destinos.slice(0, 10);
      }),
    );
  }

  /** Recorre todas las paginas de un recurso de Georef. */
  private todas<T>(recurso: string, params: Record<string, string>): Observable<T[]> {
    const pagina = (inicio: number) =>
      this.http.get<Pagina>(`${GEOREF}/${recurso}`, {
        params: { ...params, max: POR_PAGINA, inicio },
      });

    const coleccion = recurso.replace(/-/g, '_');
    return pagina(0).pipe(
      expand((actual) => {
        const siguiente = actual.inicio + actual.cantidad;
        return actual.cantidad > 0 && siguiente < actual.total ? pagina(siguiente) : of();
      }),
      reduce((filas, actual) => filas.concat(actual[coleccion] as T[]), [] as T[]),
    );
  }
}

/** Si falla, se saca del cache para que el proximo intento vuelva a pedirla. */
function enCache<T>(
  cache: Map<string, Observable<T>>,
  clave: string,
  crear: () => Observable<T>,
): Observable<T> {
  let lista = cache.get(clave);
  if (!lista) {
    lista = crear().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    cache.set(clave, lista);
    lista.subscribe({ error: () => cache.delete(clave) });
  }
  return lista;
}

const CABA = 'Ciudad Autónoma de Buenos Aires';

/** "Comuna 2, CABA" en la Capital; "Rosario, Santa Fe" en el resto. */
function detalleDeDireccion(d: DireccionDto): string {
  const provincia = d.provincia.nombre === CABA ? 'CABA' : d.provincia.nombre;
  const lugar =
    d.localidad_censal.nombre && d.localidad_censal.nombre !== d.provincia.nombre
      ? d.localidad_censal.nombre
      : d.departamento.nombre;
  return lugar ? `${lugar}, ${provincia}` : provincia;
}

/** Minusculas, sin acentos ni dieresis, y la ñ como n (Georef escribe "ORONO"). */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tipos de via que Georef antepone al nombre ("AV CORRIENTES", "BV ORONO"). */
const TIPO_DE_VIA = /^(av|avda|avenida|bv|bulevar|boulevard|calle|pje|pasaje|diag|diagonal|cno|camino) /;

/**
 * Los lugares que coinciden con `texto`: cada palabra escrita tiene que ser el
 * principio de alguna palabra del nombre ("av corr" -> "Av Corrientes", "oroño"
 * -> "Bv Orono"). Primero los que empiezan con lo escrito, sin contar el tipo
 * de via ("colon" -> "Av Colon" antes que "Colonia Anita"), despues el resto.
 */
export function filtrarLugares(lista: LugarGeoref[], texto: string, maximo = 10): LugarGeoref[] {
  const buscado = normalizar(texto);
  if (!buscado) return [];
  const palabras = buscado.split(' ');

  const coincidencias: { lugar: LugarGeoref; alPrincipio: boolean; base: string }[] = [];
  for (const lugar of lista) {
    const nombre = normalizar(lugar.nombre);
    const suyas = nombre.split(' ');
    if (!palabras.every((palabra) => suyas.some((suya) => suya.startsWith(palabra)))) continue;
    const base = nombre.replace(TIPO_DE_VIA, '');
    coincidencias.push({
      lugar,
      alPrincipio: nombre.startsWith(buscado) || base.startsWith(buscado),
      base,
    });
  }

  return coincidencias
    .sort((a, b) => Number(b.alPrincipio) - Number(a.alPrincipio) || a.base.localeCompare(b.base, 'es'))
    .slice(0, maximo)
    .map(({ lugar }) => lugar);
}

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);

/**
 * Georef escribe las calles en mayusculas ("AV CORRIENTES", "25 DE MAYO").
 * Se guardan como nombre propio: "Av Corrientes", "25 de Mayo".
 */
export function nombrePropio(texto: string): string {
  return texto
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra, i) =>
      i > 0 && MINUSCULAS.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1),
    )
    .join(' ');
}
