import {
  Calificacion,
  ReputacionEstacionamiento,
  ResumenReputacion,
  Abono,
  AccesoReserva,
  Cochera,
  Estacionamiento,
  EstadoCochera,
  FechaHoraISO,
  FranjaAtencion,
  FranjaDisponible,
  HORAS_POR_MODALIDAD,
  LoteCocheras,
  NuevaCochera,
  NuevaReserva,
  NuevaReservaConAbono,
  NuevoEstacionamiento,
  CambiosVehiculo,
  NuevoVehiculo,
  PlanAbono,
  RegistroUsuario,
  ReservaDetallada,
  TipoVehiculo,
  Usuario,
  Vehiculo,
  Opinion,
  ReputacionConductor,
  ResenaDenunciada,
} from '@app/models';
import { aInstante, DIAS_POR_NUMERO, finDeFranja, partesLocales } from '@app/utils/fecha.util';
import { CalificacionDto, ReputacionDto } from './api.dto';
import { OpinionDto, ReputacionConductorDto, ResenaDenunciadaDto } from './api.dto';
import { AbonoDto, AccesoReservaDto, CocheraDto, EstacionamientoDto, FranjaDto, HorarioDto, PlanAbonoDto, ReservaDto, UsuarioDto, VehiculoDto } from './api.dto';

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

/** El inverso de ID_TIPO_VEHICULO: id del catalogo -> tipo. */
const TIPO_POR_ID = Object.fromEntries(
  Object.entries(ID_TIPO_VEHICULO).map(([tipo, id]) => [id, tipo]),
) as Record<number, TipoVehiculo>;

/* --------------------------------- usuario -------------------------------- */

/** UsuarioDto -> Usuario. */
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

/** Un horario de la API -> franja de atencion (dia y horas HH:MM). */
function aFranjaAtencion(dto: HorarioDto): FranjaAtencion {
  return {
    dia: DIAS_POR_NUMERO[dto.dia_semana],
    desde: dto.hora_apertura.slice(0, 5),
    hasta: dto.hora_cierre.slice(0, 5),
  };
}

/** EstacionamientoDto -> Estacionamiento (direccion, tarifas, reputacion…). */
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
    politicaCancelacionHoras: dto.politica_cancelacion_horas,
    cocherasTotales: dto.cocheras_activas ?? 0,
    cocherasDisponibles: dto.cocheras_libres ?? 0,
    disponible: dto.disponible,
    tiposAdmitidos: (dto.tipos_vehiculo ?? []).map((id) => TIPO_POR_ID[id]),
    cubierto: dto.cubierto,
    publicado: dto.publicado,
    activo: dto.activo,
    estadoAprobacion: dto.estado_aprobacion,
    motivoRechazo: dto.motivo_rechazo ?? null,
    enviadoEn: dto.enviado_en,
    reputacion: aResumenReputacion(dto),
  };
}

/* ------------------------------- reputacion ------------------------------- */

/** La reputacion publica que viene con cada estacionamiento. */
function aResumenReputacion(dto: EstacionamientoDto): ResumenReputacion {
  return {
    cantidad: dto.calificaciones ?? 0,
    promedio: dto.calificacion_promedio ?? null,
    categorias: dto.calificacion_categorias ?? null,
    destacado: dto.destacado ?? false,
    nivel: dto.nivel ?? null,
    insignias: (dto.insignias ?? []).map((i) => i.codigo),
    puntaje: dto.puntaje_reputacion ?? 0,
  };
}

export function aCalificacion(dto: CalificacionDto): Calificacion {
  return { id: dto.id_calificacion, reservaId: dto.id_reserva, promedio: dto.promedio };
}

/** ReputacionDto -> la pantalla de Reputacion del propietario. */
export function aReputacion(dto: ReputacionDto): ReputacionEstacionamiento {
  const { operacion } = dto;
  return {
    dias: dto.dias,
    puntaje: dto.puntaje,
    puntajeAnterior: dto.puntaje_anterior,
    destacado: dto.destacado,
    nivel: dto.nivel,
    siguienteNivel: dto.siguiente_nivel,
    niveles: dto.niveles,
    umbralDestacado: dto.umbral_destacado,
    minimoCalificaciones: dto.minimo_calificaciones,
    calificaciones: dto.calificaciones,
    operacion: {
      puntos: operacion.puntos,
      confirmacion: operacion.confirmacion,
      cancelaciones: operacion.cancelaciones,
    },
    insignias: dto.insignias.map((i) => i.codigo),
    etiquetas: dto.etiquetas,
    sugerencia: dto.sugerencia,
    opiniones: dto.opiniones.map(aOpinion),
  };
}

/** Una opinion de la pantalla de Reputacion (con el estado de su denuncia). */
export function aOpinion(o: OpinionDto): Opinion {
  return {
    id: o.id_calificacion,
    autor: o.autor,
    creadaEn: o.created_at,
    promedio: o.promedio,
    comentario: o.comentario,
    etiquetas: o.etiquetas,
    denunciaEstado: o.denuncia_estado ?? null,
  };
}

/** La reputacion del conductor y las reseñas que recibio. */
export function aReputacionConductor(dto: ReputacionConductorDto): ReputacionConductor {
  return {
    promedio: dto.promedio,
    cantidad: dto.cantidad,
    etiquetas: dto.etiquetas,
    resenas: (dto.resenas ?? []).map((r) => ({
      id: r.id_calificacion,
      puntaje: r.puntaje,
      etiquetas: r.etiquetas,
      comentario: r.comentario,
      creadaEn: r.created_at,
      estacionamiento: r.estacionamiento,
      denunciaEstado: r.denuncia_estado,
    })),
  };
}

/** Una reseña denunciada, para la cola del administrador. */
export function aResenaDenunciada(dto: ResenaDenunciadaDto): ResenaDenunciada {
  return {
    id: dto.id_calificacion,
    autor: dto.autor,
    nota: dto.autor === 'CONDUCTOR' ? (dto.promedio ?? dto.puntaje) : dto.puntaje,
    etiquetas: dto.etiquetas,
    comentario: dto.comentario,
    creadaEn: dto.created_at,
    estacionamiento: { id: dto.id_estacionamiento, nombre: dto.estacionamiento },
    conductor: { id: dto.id_conductor, nombre: dto.conductor_nombre },
    motivo: dto.denuncia_motivo,
    detalle: dto.denuncia_detalle,
    denunciadaEn: dto.denunciada_at,
    estado: dto.denuncia_estado,
    moderadaEn: dto.moderada_at,
  };
}

/** NuevoEstacionamiento -> body de la API (snake_case). */
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
    politica_cancelacion_horas: datos.politicaCancelacionHoras,
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

/** CocheraDto -> Cochera. */
export function aCochera(dto: CocheraDto): Cochera {
  return {
    id: dto.id_cochera,
    estacionamientoId: dto.id_estacionamiento,
    identificador: dto.identificador,
    sector: dto.sector ?? '',
    tipoVehiculo: TIPO_POR_ID[dto.id_tipo_vehiculo],
    cubierta: dto.cubierta,
    estado: estadoDeCochera(dto),
    bloqueada: dto.bloqueada,
    motivoBloqueo: dto.motivo_bloqueo,
    bloqueadaHasta: dto.bloqueada_hasta,
  };
}

/** Payload de alta (todos los campos) o de cambios (solo los que vinieron) de una cochera. */
export function aPayloadCochera(datos: Partial<NuevaCochera>) {
  return {
    identificador: datos.identificador,
    id_tipo_vehiculo: datos.tipoVehiculo && ID_TIPO_VEHICULO[datos.tipoVehiculo],
    sector: datos.sector || undefined,
    cubierta: datos.cubierta,
  };
}

/** Lotes de cocheras -> body de la API. */
export function aPayloadLotes(lotes: LoteCocheras[]) {
  return {
    lotes: lotes.map((lote) => ({
      cantidad: lote.cantidad,
      sector: lote.sector,
      prefijo: lote.prefijo,
      id_tipo_vehiculo: ID_TIPO_VEHICULO[lote.tipoVehiculo],
      cubierta: lote.cubierta,
    })),
  };
}

/* -------------------------------- vehiculo -------------------------------- */

/** VehiculoDto -> Vehiculo. */
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

/** Vehiculo nuevo o cambios -> body de la API. */
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

/** ReservaDto -> ReservaDetallada (fecha y horas locales, estacionamiento, vehiculo…). */
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
    // Una reserva con abono no se cobra: se muestra por hora y el abono va aparte.
    modalidad: dto.modalidad === 'ABONO' ? 'HORA' : dto.modalidad,
    abono: dto.id_abono && dto.turno_abono ? { id: dto.id_abono, turno: dto.turno_abono } : null,
    estado: dto.estado,
    canceladaPor: dto.cancelada_por ?? null,
    precioTotal: dto.precio_total,
    creadaEn: dto.created_at,
    ingresoEn: dto.ingreso_real,
    egresoEn: dto.egreso_real,
    motivoReasignacion: dto.motivo_reasignacion,
    codigoAcceso: dto.codigo_acceso ?? null,
    calificable: dto.calificable ?? false,
    calificacionPromedio: dto.calificacion_promedio ?? null,
    reputacionConductor: {
      promedio: dto.conductor_promedio ?? null,
      cantidad: dto.conductor_calificaciones ?? 0,
    },
    calificacionAlConductor: dto.calificacion_al_conductor ?? null,
    conductorCalificable: dto.conductor_calificable ?? false,
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

export function aAccesoReserva(dto: AccesoReservaDto): AccesoReserva {
  return { accion: dto.accion, reserva: aReserva(dto.reserva) };
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
  if (datos.modalidad === 'HORA') {
    return datos.horaHasta ? finDeFranja(datos.fecha, datos.horaDesde, datos.horaHasta) : inicio;
  }
  const horas = HORAS_POR_MODALIDAD[datos.modalidad];
  return new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
}

/** Una franja de disponibilidad de la API -> FranjaDisponible. */
export function aFranja(dto: FranjaDto): FranjaDisponible {
  return {
    horaDesde: dto.hora_desde,
    horaHasta: dto.hora_hasta,
    fechaHasta: dto.fecha_hasta ?? null,
    disponible: dto.disponible,
    cocherasLibres: dto.cocheras_libres,
    causa: dto.causa ?? null,
  };
}

/* --------------------------------- abonos --------------------------------- */

/** PlanAbonoDto -> PlanAbono. */
export function aPlanAbono(dto: PlanAbonoDto): PlanAbono {
  return {
    id: dto.id_plan,
    estacionamientoId: dto.id_estacionamiento,
    turno: dto.turno,
    cupos: dto.cupos,
    precio: dto.precio,
  };
}

/** AbonoDto -> Abono. */
export function aAbono(dto: AbonoDto): Abono {
  return {
    id: dto.id_abono,
    estacionamientoId: dto.id_estacionamiento,
    estacionamiento: dto.estacionamiento,
    conductor: `${dto.conductor_nombre} ${dto.conductor_apellido}`,
    turno: dto.turno,
    cuposTotales: dto.cupos_totales,
    cuposUsados: dto.cupos_usados,
    cuposRestantes: dto.cupos_restantes,
    precioTotal: dto.precio_total,
    desde: dto.desde,
    hasta: dto.hasta,
    estado: dto.estado,
  };
}

/** Reserva con abono -> body de la API. */
export function aPayloadReservaConAbono(datos: NuevaReservaConAbono) {
  return {
    id_abono: datos.abonoId,
    id_vehiculo: datos.vehiculoId,
    inicio: aInstante(datos.fecha, datos.horaDesde),
    fin: finDeFranja(datos.fecha, datos.horaDesde, datos.horaHasta),
  };
}
