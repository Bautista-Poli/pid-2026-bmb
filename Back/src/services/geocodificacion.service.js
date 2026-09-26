// Convierte la direccion de un estacionamiento en coordenadas (latitud/longitud)
// usando Nominatim, el geocodificador gratuito de OpenStreetMap.
//
// Politica de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
//   - como maximo 1 request por segundo,
//   - un User-Agent que identifique a la aplicacion.
// Por eso las busquedas pasan por una cola que las espacia.
//
// Geocodificar nunca hace fallar el alta o la edicion: si el servicio no
// responde o no encuentra la direccion, devuelve null y el estacionamiento se
// guarda sin coordenadas (simplemente no muestra distancia).
import { config } from '../config/env.js';

const INTERVALO_MS = 1100;
const TIMEOUT_MS = 5000;

let cola = Promise.resolve();
let ultimaBusqueda = 0;

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Encadena la tarea en la cola, respetando el intervalo minimo entre requests. */
function enCola(tarea) {
  const resultado = cola.then(async () => {
    const restante = ultimaBusqueda + INTERVALO_MS - Date.now();
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

/**
 * Devuelve `{ latitud, longitud }` o `null` si no se pudo geocodificar.
 *
 * Primero prueba la busqueda estructurada (calle, ciudad, provincia...), que es
 * la mas precisa. Si no encuentra nada (pasa, por ejemplo, con "CABA" y
 * provincia "Buenos Aires"), reintenta con la direccion como texto libre.
 * @param {{ calle?: string, numero?: string, ciudad?: string, provincia?: string, codigo_postal?: string }} direccion
 */
export async function geocodificar(direccion) {
  if (!config.geocodificacion.habilitada) return null;

  const calle = [direccion.numero, direccion.calle].filter(Boolean).join(' ').trim();
  if (!calle || !direccion.ciudad) return null;

  const estructurada = new URLSearchParams({
    street: calle,
    city: direccion.ciudad,
    country: 'Argentina',
  });
  if (direccion.provincia) estructurada.set('state', direccion.provincia);
  if (direccion.codigo_postal) estructurada.set('postalcode', direccion.codigo_postal);

  const textoLibre = new URLSearchParams({
    q: [`${direccion.calle} ${direccion.numero ?? ''}`.trim(), direccion.ciudad, direccion.provincia, 'Argentina']
      .filter(Boolean)
      .join(', '),
  });

  try {
    const lugar = (await buscar(estructurada)) ?? (await buscar(textoLibre));
    if (!lugar) {
      console.warn(`[geocodificacion] sin resultados para "${calle}, ${direccion.ciudad}"`);
      return null;
    }
    return { latitud: redondear(lugar.lat), longitud: redondear(lugar.lon) };
  } catch (error) {
    console.warn('[geocodificacion] fallo la busqueda:', error.message);
    return null;
  }
}

/** Un request a `/search`. Devuelve el primer resultado o null. */
function buscar(params) {
  params.set('format', 'jsonv2');
  params.set('limit', '1');
  params.set('countrycodes', 'ar');

  return enCola(async () => {
    const respuesta = await fetch(`${config.geocodificacion.url}/search?${params}`, {
      headers: {
        'User-Agent': config.geocodificacion.userAgent,
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!respuesta.ok) throw new Error(`Nominatim respondio ${respuesta.status}`);

    const [lugar] = await respuesta.json();
    return lugar ?? null;
  });
}

/** La columna es DECIMAL(9, 6): 6 decimales (~10 cm de precision). */
function redondear(valor) {
  return Math.round(Number(valor) * 1e6) / 1e6;
}
