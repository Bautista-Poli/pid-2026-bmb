// Verifica la direccion de un estacionamiento y la convierte en coordenadas.
//
// Fuente principal: Georef (https://apis.datos.gob.ar/georef), la API oficial
// de direcciones de Argentina. Es la misma que usa el formulario del
// propietario para autocompletar provincia, ciudad y calle, asi que lo que se
// eligio ahi se encuentra aca. Ademas sirve para validar: si Georef no conoce
// esa calle con esa altura en esa ciudad, la direccion no existe.
//
// Respaldo: Nominatim (OpenStreetMap), solo para cuando Georef no responde o
// conoce la direccion pero no tiene su ubicacion. Su politica de uso pide como
// maximo 1 request por segundo y un User-Agent propio, por eso va en una cola.
import { config } from '../config/env.js';

const TIMEOUT_MS = 5000;
const INTERVALO_NOMINATIM_MS = 1100;

/**
 * Resultado de `geocodificar`:
 *   - `null`: no se pudo averiguar (geocodificacion apagada, faltan datos o
 *     ningun servicio respondio). No se sabe si la direccion existe.
 *   - `{ encontrada: false }`: segun Georef esa calle no existe en esa ciudad,
 *     o la altura queda fuera de su recorrido.
 *   - `{ encontrada: true, latitud, longitud }`: existe. Las coordenadas pueden
 *     ser `null` si ningun servicio tiene la ubicacion exacta.
 * @param {{ calle?: string, numero?: string, ciudad?: string, provincia?: string }} direccion
 */
export async function geocodificar(direccion) {
  if (!config.geocodificacion.habilitada) return null;
  if (!direccion.calle || !direccion.numero || !direccion.ciudad || !direccion.provincia) return null;

  try {
    const ubicada = await buscarDireccionEnGeoref(direccion);
    if (ubicada?.latitud != null) return { encontrada: true, ...ubicada };

    // `/direcciones` no la ubico. Puede que no exista, pero tambien falla con
    // calles que existen: no entiende nombres que empiezan con un numero
    // ("25 de Mayo ...") y le faltan tramos. Se confirma contra la lista de
    // calles de la ciudad, que es la misma que ofrece el autocompletado.
    if (!ubicada && !(await calleExisteEnGeoref(direccion))) return { encontrada: false };
  } catch (error) {
    console.warn('[geocodificacion] Georef no respondio:', error.message);
    const coordenadas = await buscarEnNominatim(direccion);
    return coordenadas ? { encontrada: true, ...coordenadas } : null;
  }

  // Existe pero Georef no sabe donde queda exactamente.
  const coordenadas = await buscarEnNominatim(direccion);
  return { encontrada: true, latitud: null, longitud: null, ...coordenadas };
}

async function georef(recurso, params) {
  const respuesta = await fetch(
    `${config.geocodificacion.georefUrl}/${recurso}?${new URLSearchParams(params)}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!respuesta.ok) throw new Error(`/${recurso} respondio ${respuesta.status}`);
  return respuesta.json();
}

/**
 * Primera direccion que devuelve Georef (`{ latitud, longitud }`, que pueden
 * ser null), o `null` si no encontro ninguna. Lanza si falla el request.
 */
async function buscarDireccionEnGeoref({ calle, numero, ciudad, provincia }) {
  const { direcciones } = await georef('direcciones', {
    direccion: `${calle} ${numero}`,
    localidad_censal: ciudad,
    provincia,
    max: '1',
    campos: 'ubicacion',
  });
  if (!direcciones?.length) return null;

  const { lat, lon } = direcciones[0].ubicacion ?? {};
  return lat == null || lon == null
    ? { latitud: null, longitud: null }
    : { latitud: redondear(lat), longitud: redondear(lon) };
}

/**
 * La calle figura en esa ciudad y la altura no pasa del final de su recorrido.
 * Georef devuelve una fila por tramo: la altura maxima es la del mas largo.
 */
async function calleExisteEnGeoref({ calle, numero, ciudad, provincia }) {
  const { calles } = await georef('calles', {
    nombre: calle,
    localidad_censal: ciudad,
    provincia,
    campos: 'nombre,altura',
    max: '100',
  });

  const buscada = normalizar(calle);
  const tramos = (calles ?? []).filter((c) => normalizar(c.nombre) === buscada);
  if (tramos.length === 0) return false;

  const alturaMaxima = Math.max(
    ...tramos.map((t) => Math.max(t.altura?.fin?.derecha ?? 0, t.altura?.fin?.izquierda ?? 0)),
  );
  const altura = Number.parseInt(numero, 10);
  // Sin datos de altura (maxima 0) o numero no numerico ("S/N"): alcanza con la calle.
  return alturaMaxima === 0 || Number.isNaN(altura) || altura <= alturaMaxima;
}

/** Minusculas, sin acentos, la ñ como n y sin puntuacion: "Bv. Oroño" -> "bv orono". */
function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------- Nominatim -------------------------------- */

let cola = Promise.resolve();
let ultimaBusqueda = 0;

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Encadena la tarea respetando el intervalo minimo entre requests a Nominatim. */
function enCola(tarea) {
  const resultado = cola.then(async () => {
    const restante = ultimaBusqueda + INTERVALO_NOMINATIM_MS - Date.now();
    if (restante > 0) await esperar(restante);
    try {
      return await tarea();
    } finally {
      ultimaBusqueda = Date.now();
    }
  });
  // Si una tarea falla, la cola sigue funcionando para las siguientes.
  cola = resultado.catch(() => {});
  return resultado;
}

/** `{ latitud, longitud }` o `null`. Nunca lanza: es el ultimo recurso. */
async function buscarEnNominatim({ calle, numero, ciudad, provincia }) {
  const params = new URLSearchParams({
    q: `${calle} ${numero}, ${ciudad}, ${provincia}, Argentina`,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ar',
  });

  try {
    return await enCola(async () => {
      const respuesta = await fetch(`${config.geocodificacion.nominatimUrl}/search?${params}`, {
        headers: { 'User-Agent': config.geocodificacion.userAgent, 'Accept-Language': 'es' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!respuesta.ok) throw new Error(`respondio ${respuesta.status}`);

      const [lugar] = await respuesta.json();
      return lugar ? { latitud: redondear(lugar.lat), longitud: redondear(lugar.lon) } : null;
    });
  } catch (error) {
    console.warn('[geocodificacion] Nominatim no respondio:', error.message);
    return null;
  }
}

/** La columna es DECIMAL(9, 6): 6 decimales (~10 cm de precision). */
function redondear(valor) {
  return Math.round(Number(valor) * 1e6) / 1e6;
}
