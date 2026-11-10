// Reglas de la reputacion: umbrales, niveles, categorias, etiquetas e insignias.
// Sin SQL ni base: lo usan los otros archivos de esta carpeta y los validadores.
// Como se calcula el puntaje esta explicado en reputacion.service.js.

export const UMBRAL_DESTACADO = 80;
export const MINIMO_CALIFICACIONES = 5;
export const UMBRAL_CATEGORIA = 4.5;
export const DIAS_BUSQUEDA = 90;

/**
 * Niveles segun el puntaje, de menor a mayor. Hace falta un minimo de
 * calificaciones (MINIMO_CALIFICACIONES) para tener nivel: sin opiniones el
 * puntaje es casi todo supuesto. Platino o mas coincide con "Anfitrion destacado".
 */
export const NIVELES = Object.freeze([
  { codigo: 'COBRE', nombre: 'Cobre', desde: 0 },
  { codigo: 'PLATA', nombre: 'Plata', desde: 50 },
  { codigo: 'ORO', nombre: 'Oro', desde: 65 },
  { codigo: 'PLATINO', nombre: 'Platino', desde: UMBRAL_DESTACADO },
  { codigo: 'ESMERALDA', nombre: 'Esmeralda', desde: 88 },
  { codigo: 'DIAMANTE', nombre: 'Diamante', desde: 95 },
]);

/** El codigo del nivel, o null si todavia no tiene suficientes calificaciones. */
export function nivelDe(puntaje, cantidad) {
  if (puntaje == null || cantidad < MINIMO_CALIFICACIONES) return null;
  return NIVELES.findLast((n) => puntaje >= n.desde).codigo;
}

/** El nivel que sigue y cuantos puntos faltan (null si ya es Diamante). */
export function siguienteNivel(puntaje) {
  const siguiente = NIVELES.find((n) => n.desde > puntaje);
  return siguiente ? { codigo: siguiente.codigo, desde: siguiente.desde, faltan: siguiente.desde - puntaje } : null;
}

export const CATEGORIAS = Object.freeze([
  { codigo: 'limpieza', nombre: 'Limpieza', insignia: 'IMPECABLE', texto: 'Impecable' },
  { codigo: 'infraestructura', nombre: 'Infraestructura', insignia: 'BUENA_INFRAESTRUCTURA', texto: 'Buena infraestructura' },
  { codigo: 'atencion', nombre: 'Atencion', insignia: 'BUENA_ATENCION', texto: 'Buena atencion' },
  { codigo: 'seguridad', nombre: 'Seguridad', insignia: 'SEGURO', texto: 'Seguro' },
  { codigo: 'acceso', nombre: 'Acceso y senalizacion', insignia: 'FACIL_ACCESO', texto: 'Facil acceso' },
]);

/** Etiquetas que puede marcar el conductor; cada una apunta a una categoria. */
export const ETIQUETAS = Object.freeze([
  { codigo: 'MUY_LIMPIO', categoria: 'limpieza', positiva: true },
  { codigo: 'BIEN_ILUMINADO', categoria: 'infraestructura', positiva: true },
  { codigo: 'BUENA_ATENCION', categoria: 'atencion', positiva: true },
  { codigo: 'SEGURO', categoria: 'seguridad', positiva: true },
  { codigo: 'FACIL_DE_LLEGAR', categoria: 'acceso', positiva: true },
  { codigo: 'POCA_LIMPIEZA', categoria: 'limpieza', positiva: false },
  { codigo: 'POCA_ILUMINACION', categoria: 'infraestructura', positiva: false },
  { codigo: 'DIFICIL_DE_MANIOBRAR', categoria: 'acceso', positiva: false },
]);

export const CODIGOS_ETIQUETA = ETIQUETAS.map((e) => e.codigo);

/** Etiquetas que puede marcar el propietario al calificar al conductor. */
const ETIQUETAS_CONDUCTOR = Object.freeze([
  { codigo: 'PUNTUAL', positiva: true },
  { codigo: 'RESPETUOSO', positiva: true },
  { codigo: 'CUIDO_LA_COCHERA', positiva: true },
  { codigo: 'LLEGO_TARDE', positiva: false },
  { codigo: 'SE_EXCEDIO', positiva: false },
  { codigo: 'NO_AVISO_AUSENCIA', positiva: false },
]);

export const CODIGOS_ETIQUETA_CONDUCTOR = ETIQUETAS_CONDUCTOR.map((e) => e.codigo);

/** Redondea a `decimales` (null queda null). */
export const redondear = (valor, decimales = 1) =>
  valor == null ? null : Math.round(valor * 10 ** decimales) / 10 ** decimales;

/**
 * Insignias a partir de destacado y los promedios por categoria. `conDetalle`
 * es cuantas calificaciones traen categorias (las de solo puntaje no cuentan
 * para las insignias de categoria).
 */
export function insigniasDe({ destacado, conDetalle, promedios }) {
  const insignias = [];
  if (destacado) insignias.push({ codigo: 'DESTACADO', texto: 'Anfitrion destacado' });
  if (conDetalle >= MINIMO_CALIFICACIONES) {
    for (const categoria of CATEGORIAS) {
      const promedio = promedios[categoria.codigo];
      if (promedio != null && promedio >= UMBRAL_CATEGORIA) {
        insignias.push({ codigo: categoria.insignia, texto: categoria.texto, categoria: categoria.codigo });
      }
    }
  }
  return insignias;
}
