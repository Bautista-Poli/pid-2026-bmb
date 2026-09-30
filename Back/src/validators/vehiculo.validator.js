import { campos } from './helpers.js';

// Ids fijos del catalogo (seed.sql). Solo la moto tiene un formato distinto.
const ID_TIPO_MOTO = 2;

// Patentes argentinas, ya normalizadas (mayusculas y sin espacios): se acepta
// el formato viejo y el Mercosur de cada tipo.
const FORMATOS_PATENTE = {
  moto: { regex: /^(\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/, ejemplos: '123ABC o A123BCD' },
  auto: { regex: /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/, ejemplos: 'ABC123 o AB123CD' },
};

/**
 * Devuelve el mensaje de error si la patente (normalizada) no corresponde al
 * tipo de vehiculo, o null si es valida. Lo usa tambien el PATCH, que cruza
 * con los datos guardados cuando solo cambia uno de los dos campos.
 */
export function errorPatente(patente, idTipoVehiculo) {
  const esMoto = Number(idTipoVehiculo) === ID_TIPO_MOTO;
  const { regex, ejemplos } = esMoto ? FORMATOS_PATENTE.moto : FORMATOS_PATENTE.auto;
  if (regex.test(patente)) return null;
  return `no es valida para ${esMoto ? 'moto' : 'este vehiculo'} (ej: ${ejemplos})`;
}

/**
 * La patente se guarda normalizada para que el UNIQUE sea real. Si tambien vino
 * el tipo, se verifica que el formato le corresponda.
 */
function normalizarYCruzarPatente(validador) {
  const resultado = validador.resultado();
  const { valores } = resultado;
  if (!valores.patente) return resultado;

  valores.patente = valores.patente.toUpperCase().replace(/\s+/g, '');
  if (valores.id_tipo_vehiculo) {
    const error = errorPatente(valores.patente, valores.id_tipo_vehiculo);
    if (error) validador.verificar(false, 'patente', error);
  }
  return resultado;
}

export function validarVehiculo(body) {
  const validador = campos(body)
    .texto('patente', body.patente, { min: 5, max: 12 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { min: 1 })
    .texto('marca', body.marca, { requerido: false, max: 60 })
    .texto('modelo', body.modelo, { requerido: false, max: 60 })
    .texto('color', body.color, { requerido: false, max: 30 })
    .booleano('predeterminado', body.predeterminado, { requerido: false });

  return normalizarYCruzarPatente(validador);
}

/**
 * Update parcial (PATCH): mismas reglas que el alta pero todo opcional. Solo se
 * validan y devuelven los campos presentes; el resto queda fuera del UPDATE.
 * Si llegan patente y tipo juntos se cruzan aca; si llega uno solo, el service
 * lo cruza con el valor guardado.
 */
export function validarCambiosVehiculo(body) {
  const validador = campos(body)
    .texto('patente', body.patente, { requerido: false, min: 5, max: 12 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { requerido: false, min: 1 })
    .texto('marca', body.marca, { requerido: false, max: 60 })
    .texto('modelo', body.modelo, { requerido: false, max: 60 })
    .texto('color', body.color, { requerido: false, max: 30 })
    .booleano('predeterminado', body.predeterminado, { requerido: false });

  return normalizarYCruzarPatente(validador);
}
