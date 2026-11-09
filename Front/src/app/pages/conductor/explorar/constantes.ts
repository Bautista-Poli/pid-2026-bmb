// Constantes de la pantalla Explorar (mapa.ts): topes de los filtros, valores
// iniciales del panel, opciones de nivel y orden, y clases de cada estado.
import { CodigoNivel, OrdenEstacionamiento } from '@app/models';
import { EstadoDisponibilidad } from '@app/utils/disponibilidad.util';
import { hoyISO } from '@app/utils/fecha.util';
import { Panel } from './panel.interface';

/** Tope del rango de precios (por hora). En el tope, el maximo no filtra. */
export const PRECIO_TOPE = 5000;
export const PRECIO_PASO = 100;

/** Tope de horas a reservar en el filtro. */
export const HORAS_MAXIMAS = 12;

/** Estacionamientos por pagina en la lista (en el mapa van todos los de la zona). */
export const POR_PAGINA = 10;

/** Sin filtros: ahora, cualquier precio, ordenado por cercania. */
export const PANEL_INICIAL: Panel = {
  fecha: hoyISO(),
  desde: '',
  horas: 1,
  precioMinimo: 0,
  precioMaximo: PRECIO_TOPE,
  orden: 'DISTANCIA',
  soloCubiertos: false,
  nivelMinimo: null,
};

/** Opciones de "Nivel del estacionamiento": todos, o de ese nivel para arriba. */
export const OPCIONES_NIVEL: { nivel: CodigoNivel | null; texto: string }[] = [
  { nivel: null, texto: 'Todos' },
  { nivel: 'COBRE', texto: 'Cobre o más' },
  { nivel: 'PLATA', texto: 'Plata o más' },
  { nivel: 'ORO', texto: 'Oro o más' },
  { nivel: 'PLATINO', texto: 'Platino o más' },
  { nivel: 'ESMERALDA', texto: 'Esmeralda o más' },
  { nivel: 'DIAMANTE', texto: 'Solo Diamante' },
];

/** Opciones de "Ordenar por". */
export const ORDENES: { orden: OrdenEstacionamiento; texto: string }[] = [
  { orden: 'DISTANCIA', texto: 'Más cercano' },
  { orden: 'PRECIO', texto: 'Más barato' },
  { orden: 'REPUTACION', texto: 'Mejor calificados' },
];

/**
 * Clases del cartel de disponibilidad de cada resultado de la lista
 * ("Disponible", "Poca disponibilidad", "No disponible"), en mapa.html. Los
 * colores estan en mapa.css.
 */
export const CLASE_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'resultado__estado--disponible',
  POCA: 'resultado__estado--poca',
  NO_DISPONIBLE: 'resultado__estado--no-disponible',
};
