import {
  Cochera,
  Estacionamiento,
  EstadoCochera,
  EstadoReserva,
  FechaHoraISO,
  FranjaAtencion,
  FranjaDisponible,
  HORAS_POR_MODALIDAD,
  NuevaCochera,
  NuevaReserva,
  NuevoLoteCocheras,
  NuevoEstacionamiento,
  CambiosVehiculo,
  NuevoVehiculo,
  RegistroUsuario,
  ReservaDetallada,
  TipoVehiculo,
  Usuario,
  Vehiculo,
} from '@app/models';
import { aInstante, DIAS_POR_NUMERO, partesLocales } from '@app/utils/fecha.util';
import { CocheraDto, EstacionamientoDto, EstadoReservaDto, FranjaDto, HorarioDto, ReservaDto, UsuarioDto, VehiculoDto } from './api.dto';

/*
 * Traduccion entre la API (snake_case, ids de catalogo, instantes ISO) y los
 * modelos del front. Es el unico lugar que conoce la forma de las respuestas.
 */

/** Ids del catalogo `tipo_vehiculo` (backend/src/db/seed.sql). */
export const ID_TIPO_VEHICULO: Record<TipoVehiculo, number> = {
  AUTO: 1,
  MOTO: 2,
  CAMIONETA: 3,
};

const TIPO_POR_ID: Record<number, TipoVehiculo> = {
  1: 'AUTO',
  2: 'MOTO',
  3: 'CAMIONETA',
};

/* --------------------------------- usuario -------------------------------- */

export function aUsuario(dto: UsuarioDto): Usuario {
  return {
    id: dto.id_usuario,
    nombre: dto.nombre,
    apellido: dto.apellido,
    email: dto.email,
    telefono: dto.telefono,
    rol: dto.rol,
    roles: dto.roles,
    fechaAlta: dto.created_at,
    activo: dto.activo,
  };
}

export function aPayloadRegistro(datos: RegistroUsuario) {
  return { ...datos, telefono: datos.telefono || undefined };
}

/* ----------------------------- estacionamiento ---------------------------- */

function aFranjaAtencion(dto: HorarioDto): FranjaAtencion {
  return {
    dia: DIAS_POR_NUMERO[dto.dia_semana],
    desde: dto.hora_apertura.slice(0, 5),
    hasta: dto.hora_cierre.slice(0, 5),
  };
}

export function aEstacionamiento(dto: EstacionamientoDto): Estacionamiento {
  return {
    id: dto.id_estacionamiento,
    propietarioId: dto.id_propietario,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? '',
    // Los estacionamientos cargados antes de desglosar la direccion solo tienen `direccion`.
    direccion: {
      calle: dto.calle ?? dto.direccion,
      numero: dto.numero ?? '',
      ciudad: dto.ciudad ?? '',
      provincia: dto.provincia ?? '',
      codigoPostal: dto.codigo_postal ?? '',
      latitud: dto.latitud,
      longitud: dto.longitud,
    },
    barrioZona: dto.barrio_zona,
    telefonoContacto: dto.telefono_contacto,
    emailContacto: dto.email_contacto,
    horarios: (dto.horarios ?? []).map(aFranjaAtencion),
    tarifas: { hora: dto.tarifa_hora, estadia: dto.tarifa_estadia, jornada: dto.tarifa_jornada },
    cocherasTotales: dto.cocheras_activas ?? 0,
    cocherasDisponibles: dto.cocheras_libres ?? 0,
    tiposAdmitidos: (dto.tipos_vehiculo ?? []).map((id) => TIPO_POR_ID[id]),
    cubierto: dto.cubierto,
    fotoUrl: urlDeFoto(dto),
    publicado: dto.publicado,
    activo: dto.activo,
  };
}

/**
 * La foto se pide a la API, pero un `<img src>` no pasa por los interceptores,
 * asi que la URL lleva el prefijo `/api` escrito. El `?v=` la hace cambiar
 * cuando el propietario sube una nueva, para saltear el cache del navegador.
 */
function urlDeFoto(dto: EstacionamientoDto): string | null {
  if (!dto.foto_actualizada) return null;
  const version = Date.parse(dto.foto_actualizada);
  return `/api/estacionamientos/${dto.id_estacionamiento}/foto?v=${version}`;
}

export function aPayloadEstacionamiento(datos: NuevoEstacionamiento) {
  const { direccion } = datos;
  return {
    nombre: datos.nombre,
    descripcion: datos.descripcion,
    calle: direccion.calle,
    numero: direccion.numero,
    ciudad: direccion.ciudad,
    provincia: direccion.provincia,
    codigo_postal: direccion.codigoPostal || undefined,
    barrio_zona: datos.barrioZona,
    latitud: direccion.latitud,
    longitud: direccion.longitud,
    telefono_contacto: datos.telefonoContacto,
    email_contacto: datos.emailContacto,
    tarifa_hora: datos.tarifas.hora,
    tarifa_estadia: datos.tarifas.estadia,
    tarifa_jornada: datos.tarifas.jornada,
    cubierto: datos.cubierto,
    publicado: datos.publicado,
    horarios: datos.horarios.map((franja) => ({
      dia_semana: DIAS_POR_NUMERO.indexOf(franja.dia),
      hora_apertura: franja.desde,
      hora_cierre: franja.hasta,
    })),
  };
}

/* --------------------------------- cochera -------------------------------- */

/**
 * Una cochera dada de baja se ve INACTIVA, y una LIBRE con una reserva
 * transcurriendo se ve RESERVADA (el estado fisico no cambia al reservar).
 */
function estadoDeCochera(dto: CocheraDto): EstadoCochera {
  if (!dto.activo) return 'INACTIVA';
  if (dto.estado_actual === 'LIBRE' && dto.reservada_ahora) return 'RESERVADA';
  return dto.estado_actual;
}

export function aCochera(dto: CocheraDto): Cochera {
  return {
    id: dto.id_cochera,
    estacionamientoId: dto.id_estacionamiento,
    identificador: dto.identificador,
    sector: dto.sector ?? '',
    tipoVehiculo: TIPO_POR_ID[dto.id_tipo_vehiculo],
    cubierta: dto.cubierta,
    estado: estadoDeCochera(dto),
  };
}

export function aPayloadCochera(datos: NuevaCochera) {
  return {
    identificador: datos.identificador,
    id_tipo_vehiculo: ID_TIPO_VEHICULO[datos.tipoVehiculo],
    sector: datos.sector || undefined,
    cubierta: datos.cubierta,
    estado_actual: datos.estado,
  };
}

export function aPayloadLoteCochera(datos: NuevoLoteCocheras) {
  return {
    cantidad: datos.cantidad,
    sector: datos.sector,
    id_tipo_vehiculo: ID_TIPO_VEHICULO[datos.tipoVehiculo],
    cubierta: datos.cubierta,
  };
}

export function aPayloadCambiosCochera(cambios: Partial<NuevaCochera>) {
  return {
    identificador: cambios.identificador,
    id_tipo_vehiculo: cambios.tipoVehiculo && ID_TIPO_VEHICULO[cambios.tipoVehiculo],
    sector: cambios.sector || undefined,
    cubierta: cambios.cubierta,
    estado_actual: cambios.estado,
  };
}

/* -------------------------------- vehiculo -------------------------------- */

export function aVehiculo(dto: VehiculoDto): Vehiculo {
  return {
    id: dto.id_vehiculo,
    usuarioId: dto.id_conductor,
    patente: dto.patente,
    marca: dto.marca,
    modelo: dto.modelo,
    color: dto.color,
    tipo: TIPO_POR_ID[dto.id_tipo_vehiculo],
    predeterminado: dto.predeterminado,
    activo: dto.activo,
  };
}

export function aPayloadVehiculo(datos: NuevoVehiculo) {
  return {
    patente: datos.patente,
    id_tipo_vehiculo: ID_TIPO_VEHICULO[datos.tipo],
    marca: datos.marca,
    modelo: datos.modelo,
    color: datos.color,
    predeterminado: datos.predeterminado,
  };
}

/** Solo viajan los campos presentes: lo que el editor no toco queda `undefined`. */
export function aPayloadCambiosVehiculo(cambios: CambiosVehiculo) {
  return {
    patente: cambios.patente,
    id_tipo_vehiculo: cambios.tipo && ID_TIPO_VEHICULO[cambios.tipo],
    marca: cambios.marca,
    modelo: cambios.modelo,
    color: cambios.color,
    predeterminado: cambios.predeterminado,
  };
}

/* --------------------------------- reserva -------------------------------- */

export function aReserva(dto: ReservaDto): ReservaDetallada {
  const desde = partesLocales(dto.inicio);
  const hasta = partesLocales(dto.fin);

  return {
    id: dto.id_reserva,
    conductorId: dto.id_conductor,
    estacionamientoId: dto.id_estacionamiento,
    cocheraId: dto.id_cochera,
    cocheraIdentificador: dto.cochera,
    vehiculoId: dto.id_vehiculo,
    fecha: desde.fecha,
    horaDesde: desde.hora,
    horaHasta: hasta.hora,
    fechaHasta: hasta.fecha,
    modalidad: dto.modalidad,
    estado: dto.estado,
    precioTotal: dto.precio_total,
    creadaEn: dto.created_at,
    ingresoEn: dto.ingreso_real,
    egresoEn: dto.egreso_real,
    estacionamiento: {
      id: dto.id_estacionamiento,
      nombre: dto.estacionamiento,
      direccion: {
        calle: dto.direccion,
        numero: '',
        ciudad: '',
        provincia: '',
        codigoPostal: '',
        latitud: null,
        longitud: null,
      },
    },
    vehiculo: {
      id: dto.id_vehiculo,
      patente: dto.patente,
      marca: dto.marca,
      modelo: dto.modelo,
      tipo: TIPO_POR_ID[dto.id_tipo_vehiculo],
    },
    cochera: { id: dto.id_cochera, identificador: dto.cochera, sector: dto.cochera_sector ?? '' },
  };
}

/** El backend asigna la cochera: se reserva por estacionamiento. */
export function aPayloadReserva(datos: NuevaReserva) {
  const inicio = aInstante(datos.fecha, datos.horaDesde);
  return {
    id_estacionamiento: datos.estacionamientoId,
    id_vehiculo: datos.vehiculoId,
    modalidad: datos.modalidad,
    inicio,
    fin: finDeReserva(datos, inicio),
  };
}

/** Por hora el fin lo elige el conductor; estadia y jornada duran un bloque fijo desde el ingreso. */
function finDeReserva(datos: NuevaReserva, inicio: FechaHoraISO): FechaHoraISO {
  if (datos.modalidad === 'HORA') return aInstante(datos.fecha, datos.horaHasta ?? datos.horaDesde);
  const horas = HORAS_POR_MODALIDAD[datos.modalidad];
  return new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
}

export function aFranja(dto: FranjaDto): FranjaDisponible {
  return {
    horaDesde: dto.hora_desde,
    horaHasta: dto.hora_hasta,
    disponible: dto.disponible,
    cocherasLibres: dto.cocheras_libres,
  };
}
