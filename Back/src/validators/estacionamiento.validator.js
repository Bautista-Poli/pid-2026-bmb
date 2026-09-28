import { ESTADOS_COCHERA } from '../utils/roles.js';
import { CAMPOS_TARIFA, MODALIDADES } from '../utils/tarifas.js';
import { campos } from './helpers.js';

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const vino = (valor) => valor !== undefined && valor !== null && valor !== '';
const CAMPOS_EDITABLES = [
  'nombre', 'descripcion', 'calle', 'numero', 'ciudad', 'provincia', 'codigo_postal',
  'barrio_zona', 'latitud', 'longitud', 'telefono_contacto', 'email_contacto',
  'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada', 'cubierto', 'publicado', 'horarios',
];
const CAMPOS_BORRABLES = [
  'descripcion', 'codigo_postal', 'barrio_zona', 'latitud', 'longitud',
  'telefono_contacto', 'email_contacto', 'tarifa_hora', 'tarifa_estadia', 'tarifa_jornada',
];
const CAMPOS_COCHERA_EDITABLES = [
  'identificador',
  'id_tipo_vehiculo',
  'sector',
  'cubierta',
  'estado_actual',
];

export function validarEstacionamiento(body) {
  const validador = campos(body)
    .texto('nombre', body.nombre, { min: 3, max: 120 })
    .texto('descripcion', body.descripcion, { requerido: false, max: 500 })
    .texto('calle', body.calle, { min: 2, max: 120 })
    .texto('numero', body.numero, { min: 1, max: 10 })
    .texto('ciudad', body.ciudad, { min: 2, max: 80 })
    .texto('provincia', body.provincia, { min: 2, max: 80 })
    .texto('codigo_postal', body.codigo_postal, { requerido: false, max: 10 })
    .texto('barrio_zona', body.barrio_zona, { requerido: false, max: 120 })
    .numero('latitud', body.latitud, { requerido: false, min: -90, max: 90 })
    .numero('longitud', body.longitud, { requerido: false, min: -180, max: 180 })
    .texto('telefono_contacto', body.telefono_contacto, { requerido: false, max: 30 })
    .email('email_contacto', body.email_contacto, { requerido: false })
    .numero('tarifa_hora', body.tarifa_hora, { requerido: false, min: 0 })
    .numero('tarifa_estadia', body.tarifa_estadia, { requerido: false, min: 0 })
    .numero('tarifa_jornada', body.tarifa_jornada, { requerido: false, min: 0 })
    .booleano('cubierto', body.cubierto, { requerido: false, default: false })
    .booleano('publicado', body.publicado, { requerido: false, default: false });

  const { valores, errores } = validador.resultado();

  // Tiene que ofrecer al menos una modalidad; null y vacio cuentan como "no la ofrece".
  if (!CAMPOS_TARIFA.some((campo) => vino(body[campo]))) {
    errores.push({
      campo: 'tarifa_hora',
      mensaje: 'ofrece al menos una tarifa (hora, estadia o jornada)',
    });
  }

  // `direccion` se guarda armada para la busqueda por texto y los listados.
  if (valores.calle && valores.numero) {
    valores.direccion = `${valores.calle} ${valores.numero}`;
  }

  valores.horarios = validarHorarios(body.horarios, errores);

  return { valores, errores };
}

/** Los horarios son opcionales y se cargan junto con el estacionamiento. */
function validarHorarios(horarios, errores) {
  if (horarios === undefined || horarios === null) return [];

  if (!Array.isArray(horarios)) {
    errores.push({ campo: 'horarios', mensaje: 'debe ser un arreglo' });
    return [];
  }

  const diasUsados = new Set();
  const normalizados = [];

  horarios.forEach((horario, indice) => {
    const { valores, errores: erroresHorario } = campos(horario ?? {})
      .entero('dia_semana', horario?.dia_semana, { min: 0, max: 6 })
      .hora('hora_apertura', horario?.hora_apertura)
      .hora('hora_cierre', horario?.hora_cierre)
      .resultado();

    erroresHorario.forEach((error) => {
      errores.push({ campo: `horarios[${indice}].${error.campo}`, mensaje: error.mensaje });
    });

    if (erroresHorario.length > 0) return;

    if (valores.hora_cierre <= valores.hora_apertura) {
      errores.push({
        campo: `horarios[${indice}].hora_cierre`,
        mensaje: 'debe ser posterior a hora_apertura',
      });
      return;
    }

    if (diasUsados.has(valores.dia_semana)) {
      errores.push({
        campo: `horarios[${indice}].dia_semana`,
        mensaje: 'ya hay otro horario cargado para ese dia',
      });
      return;
    }

    diasUsados.add(valores.dia_semana);
    normalizados.push(valores);
  });

  return normalizados;
}

/**
 * PATCH de estacionamiento: todo opcional, pero tiene que venir al menos un
 * campo. Si vienen `horarios` reemplazan a los cargados.
 */
export function validarCambiosEstacionamiento(body) {
  const validador = campos(body)
    .texto('nombre', body.nombre, { requerido: false, min: 3, max: 120 })
    .texto('descripcion', body.descripcion, { requerido: false, max: 500 })
    .texto('calle', body.calle, { requerido: false, min: 2, max: 120 })
    .texto('numero', body.numero, { requerido: false, min: 1, max: 10 })
    .texto('ciudad', body.ciudad, { requerido: false, min: 2, max: 80 })
    .texto('provincia', body.provincia, { requerido: false, min: 2, max: 80 })
    .texto('codigo_postal', body.codigo_postal, { requerido: false, max: 10 })
    .texto('barrio_zona', body.barrio_zona, { requerido: false, max: 120 })
    .numero('latitud', body.latitud, { requerido: false, min: -90, max: 90 })
    .numero('longitud', body.longitud, { requerido: false, min: -180, max: 180 })
    .texto('telefono_contacto', body.telefono_contacto, { requerido: false, max: 30 })
    .email('email_contacto', body.email_contacto, { requerido: false })
    .numero('tarifa_hora', body.tarifa_hora, { requerido: false, min: 0 })
    .numero('tarifa_estadia', body.tarifa_estadia, { requerido: false, min: 0 })
    .numero('tarifa_jornada', body.tarifa_jornada, { requerido: false, min: 0 })
    .booleano('cubierto', body.cubierto, { requerido: false })
    .booleano('publicado', body.publicado, { requerido: false })
    .verificar(
      CAMPOS_EDITABLES.some((campo) => body[campo] !== undefined),
      'body',
      `enviar al menos uno de: ${CAMPOS_EDITABLES.join(', ')}`,
    );

  const { valores, errores } = validador.resultado();

  // Un null (o un texto vacio) borra el dato opcional en vez de ignorarlo.
  for (const campo of CAMPOS_BORRABLES) {
    if (body[campo] === null || body[campo] === '') valores[campo] = null;
  }

  if (body.horarios !== undefined) {
    valores.horarios = validarHorarios(body.horarios, errores);
  }

  return { valores, errores };
}

export function validarCochera(body) {
  return campos(body)
    .texto('identificador', body.identificador, { min: 1, max: 20 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { min: 1 })
    .texto('sector', body.sector, { requerido: false, max: 40 })
    .booleano('cubierta', body.cubierta, { requerido: false, default: false })
    .enumerado('estado_actual', body.estado_actual, Object.values(ESTADOS_COCHERA), {
      requerido: false,
      default: ESTADOS_COCHERA.LIBRE,
    })
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
      .texto('sector', lote?.sector, { min: 1, max: 20 })
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

/** PATCH de cochera: todo opcional, pero tiene que venir al menos un campo. */
export function validarActualizacionCochera(body) {
  return campos(body)
    .texto('identificador', body.identificador, { requerido: false, min: 1, max: 20 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { requerido: false, min: 1 })
    .texto('sector', body.sector, { requerido: false, max: 40 })
    .booleano('cubierta', body.cubierta, { requerido: false })
    .enumerado('estado_actual', body.estado_actual, Object.values(ESTADOS_COCHERA), {
      requerido: false,
    })
    .verificar(
      CAMPOS_COCHERA_EDITABLES.some((campo) => body[campo] !== undefined),
      'body',
      `enviar al menos uno de: ${CAMPOS_COCHERA_EDITABLES.join(', ')}`,
    )
    .resultado();
}

/**
 * Filtros de GET /api/estacionamientos. Todo opcional. La disponibilidad se pide
 * de una de dos formas, excluyentes: `disponible_ahora=true` o una franja
 * `inicio` + `fin`. Con `incluir_no_disponibles=true` no se descartan los que
 * no tienen lugar (o estan cerrados) en ese momento: vienen marcados con
 * `disponible = false`.
 * `lat_min`, `lat_max`, `lng_min` y `lng_max` (juntos) limitan la busqueda a
 * un rectangulo: la parte del mapa que se esta viendo.
 */
export function validarBusqueda(query) {
  const { valores, errores } = campos(query)
    .texto('q', query.q, { requerido: false, max: 120 })
    .texto('zona', query.zona, { requerido: false, max: 120 })
    .entero('id_tipo_vehiculo', query.id_tipo_vehiculo, { requerido: false, min: 1 })
    .numero('tarifa_min', query.tarifa_min, { requerido: false, min: 0 })
    .numero('tarifa_max', query.tarifa_max, { requerido: false, min: 0 })
    .booleano('cubierto', query.cubierto, { requerido: false })
    .booleano('disponible_ahora', query.disponible_ahora, { requerido: false })
    .booleano('incluir_no_disponibles', query.incluir_no_disponibles, { requerido: false })
    .fechaHora('inicio', query.inicio, { requerido: false })
    .fechaHora('fin', query.fin, { requerido: false })
    .numero('lat_min', query.lat_min, { requerido: false, min: -90, max: 90 })
    .numero('lat_max', query.lat_max, { requerido: false, min: -90, max: 90 })
    .numero('lng_min', query.lng_min, { requerido: false, min: -180, max: 180 })
    .numero('lng_max', query.lng_max, { requerido: false, min: -180, max: 180 })
    .entero('limit', query.limit, { requerido: false, min: 1, max: 100, default: 20 })
    .entero('offset', query.offset, { requerido: false, min: 0, default: 0 })
    .resultado();

  const hayFranja = vino(query.inicio) || vino(query.fin);

  const franjaCompleta = valores.inicio && valores.fin;
  const franjaConError = errores.some((e) => e.campo === 'inicio' || e.campo === 'fin');

  if (hayFranja && !franjaCompleta && !franjaConError) {
    errores.push({ campo: 'inicio', mensaje: 'inicio y fin se envian juntos' });
  }
  if (franjaCompleta && valores.fin <= valores.inicio) {
    errores.push({ campo: 'fin', mensaje: 'debe ser posterior a inicio' });
  }
  if (hayFranja && valores.disponible_ahora) {
    errores.push({ campo: 'disponible_ahora', mensaje: 'no se combina con inicio y fin' });
  }

  const LIMITES = ['lat_min', 'lat_max', 'lng_min', 'lng_max'];
  const hayArea = LIMITES.some((campo) => vino(query[campo]));
  const areaConError = errores.some((e) => LIMITES.includes(e.campo));
  if (hayArea && !areaConError) {
    if (!LIMITES.every((campo) => valores[campo] !== undefined)) {
      errores.push({ campo: 'lat_min', mensaje: 'lat_min, lat_max, lng_min y lng_max se envian juntos' });
    } else if (valores.lat_max < valores.lat_min) {
      errores.push({ campo: 'lat_max', mensaje: 'debe ser mayor o igual a lat_min' });
    } else if (valores.lng_max < valores.lng_min) {
      errores.push({ campo: 'lng_max', mensaje: 'debe ser mayor o igual a lng_min' });
    }
  }

  return { valores, errores };
}

/**
 * GET /api/estacionamientos/:id/disponibilidad?fecha=YYYY-MM-DD[&id_tipo_vehiculo=1]
 * [&modalidad=HORA&horas=3]. Con `horas` o `modalidad` devuelve un ingreso por
 * cada hora del dia; sin ninguno, las franjas estandar.
 */
export function validarDisponibilidad(query) {
  const { valores, errores } = campos(query)
    .texto('fecha', query.fecha, { min: 10, max: 10 })
    .entero('id_tipo_vehiculo', query.id_tipo_vehiculo, { requerido: false, min: 1 })
    .enumerado('modalidad', query.modalidad, Object.values(MODALIDADES), { requerido: false })
    .entero('horas', query.horas, { requerido: false, min: 1, max: 24 })
    .resultado();

  if (valores.modalidad === MODALIDADES.HORA && valores.horas === undefined) {
    errores.push({ campo: 'horas', mensaje: 'requerido con la modalidad HORA' });
  }

  validarFecha(valores, errores);
  return { valores, errores };
}

/** GET /api/estacionamientos/:id/reservas[?fecha=YYYY-MM-DD] */
export function validarFiltroReservas(query) {
  const { valores, errores } = campos(query)
    .texto('fecha', query.fecha, { requerido: false, min: 10, max: 10 })
    .resultado();

  validarFecha(valores, errores);
  return { valores, errores };
}

/** `YYYY-MM-DD` que ademas exista en el calendario (rechaza 2026-02-30). */
function validarFecha(valores, errores) {
  if (!valores.fecha) return;

  const fecha = new Date(`${valores.fecha}T00:00:00Z`);
  const valida =
    REGEX_FECHA.test(valores.fecha) &&
    !Number.isNaN(fecha.getTime()) &&
    fecha.toISOString().startsWith(valores.fecha);

  if (!valida) errores.push({ campo: 'fecha', mensaje: 'debe ser una fecha valida YYYY-MM-DD' });
}
