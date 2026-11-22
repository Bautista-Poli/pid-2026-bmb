// Validadores de las cocheras de un estacionamiento (estacionamiento-cochera.routes.js):
// alta, alta por lotes, edicion y bloqueo. Devuelven { valores, errores } y
// validate() responde 400.
import { campos } from './helpers.js';

const CAMPOS_COCHERA_EDITABLES = [
  'identificador',
  'id_tipo_vehiculo',
  'sector',
  'cubierta',
];

/** Alta de una cochera: identificador, tipo de vehiculo, sector y techo. */
export function validarCochera(body) {
  return campos(body)
    .texto('identificador', body.identificador, { min: 1, max: 20 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { min: 1 })
    .texto('sector', body.sector, { requerido: false, max: 40 })
    .booleano('cubierta', body.cubierta, { requerido: false, default: false })
    .resultado();
}

const MAX_LOTES = 20;
const MAX_COCHERAS_POR_LOTE = 200;
const MAX_COCHERAS_POR_PEDIDO = 500;
const REGEX_PREFIJO = /^[A-Za-z0-9_-]+$/;

/**
 * Alta por cantidad: cada lote crea `cantidad` cocheras con identificadores
 * `<prefijo>-<n>` y el mismo detalle de ubicacion (`sector`).
 */
export function validarLoteCocheras(body) {
  const valores = { lotes: [] };
  const errores = [];

  if (!Array.isArray(body.lotes) || body.lotes.length === 0) {
    errores.push({ campo: 'lotes', mensaje: 'debe ser una lista con al menos un lote' });
    return { valores, errores };
  }
  if (body.lotes.length > MAX_LOTES) {
    errores.push({ campo: 'lotes', mensaje: `no puede tener mas de ${MAX_LOTES} lotes` });
    return { valores, errores };
  }

  body.lotes.forEach((lote, i) => {
    const validador = campos(lote ?? {})
      .entero('cantidad', lote?.cantidad, { min: 1, max: MAX_COCHERAS_POR_LOTE })
      .texto('sector', lote?.sector, { min: 1, max: 40 })
      .texto('prefijo', lote?.prefijo, { min: 1, max: 10 })
      .entero('id_tipo_vehiculo', lote?.id_tipo_vehiculo, { min: 1 })
      .booleano('cubierta', lote?.cubierta, { requerido: false, default: false })
      .resultado();

    if (validador.valores.prefijo && !REGEX_PREFIJO.test(validador.valores.prefijo)) {
      validador.errores.push({
        campo: 'prefijo',
        mensaje: 'solo admite letras, numeros, guion y guion bajo',
      });
    }

    for (const error of validador.errores) {
      errores.push({ campo: `lotes[${i}].${error.campo}`, mensaje: error.mensaje });
    }
    valores.lotes.push(validador.valores);
  });

  const total = valores.lotes.reduce((suma, lote) => suma + (lote.cantidad ?? 0), 0);
  if (total > MAX_COCHERAS_POR_PEDIDO) {
    errores.push({
      campo: 'lotes',
      mensaje: `no se pueden crear mas de ${MAX_COCHERAS_POR_PEDIDO} cocheras por pedido`,
    });
  }

  return { valores, errores };
}

/** POST bloqueo de cochera: todo opcional, se puede bloquear sin motivo ni fecha. */
export function validarBloqueoCochera(body) {
  return campos(body)
    .texto('motivo', body.motivo, { requerido: false, max: 300 })
    .fechaHora('hasta', body.hasta, { requerido: false })
    .booleano('forzar', body.forzar, { requerido: false, default: false })
    .resultado();
}

/** PATCH de cochera: todo opcional, pero tiene que venir al menos un campo. */
export function validarActualizacionCochera(body) {
  return campos(body)
    .texto('identificador', body.identificador, { requerido: false, min: 1, max: 20 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { requerido: false, min: 1 })
    .texto('sector', body.sector, { requerido: false, max: 40 })
    .booleano('cubierta', body.cubierta, { requerido: false })
    .verificar(
      CAMPOS_COCHERA_EDITABLES.some((campo) => body[campo] !== undefined),
      'body',
      `enviar al menos uno de: ${CAMPOS_COCHERA_EDITABLES.join(', ')}`,
    )
    .resultado();
}
