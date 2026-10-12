import {
  Incidencia,
  IncidenciaDetallada,
  IncidenciaModerada,
  NuevoReclamo,
  MensajeIncidencia,
  Abono,
  AccesoReserva,
  Cochera,
  Estacionamiento,
  EstadoCochera,
  EstadoReserva,
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
} from '@app/models';
import { aInstante, DIAS_POR_NUMERO, partesLocales } from '@app/utils/fecha.util';
import { AbonoDto, AccesoReservaDto, IncidenciaDetalladaDto, IncidenciaDto, IncidenciaModeradaDto, MensajeIncidenciaDto, CocheraDto, EstacionamientoDto, EstadoReservaDto, FranjaDto, HorarioDto, PlanAbonoDto, ReservaDto, UsuarioDto, VehiculoDto } from './api.dto';

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
    politicaCancelacionHoras: dto.politica_cancelacion_horas,
    cocherasTotales: dto.cocheras_activas ?? 0,
    cocherasDisponibles: dto.cocheras_libres ?? 0,
    disponible: dto.disponible,
    tiposAdmitidos: (dto.tipos_vehiculo ?? []).map((id) => TIPO_POR_ID[id]),
    cubierto: dto.cubierto,
    fotoUrl: urlDeFoto(dto),
    fotos: urlsDeGaleria(dto),
    publicado: dto.publicado,
    activo: dto.activo,
    estadoAprobacion: dto.estado_aprobacion,
    motivoRechazo: dto.motivo_rechazo ?? null,
    enviadoEn: dto.enviado_en,
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

function urlsDeGaleria(dto: EstacionamientoDto): string[] {
  return (dto.fotos ?? []).map(
    ({ id_foto, actualizada }) =>
      `/api/estacionamientos/${dto.id_estacionamiento}/fotos/${id_foto}?v=${Date.parse(actualizada)}`,
  );
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

export function aPayloadCochera(datos: NuevaCochera) {
  return {
    identificador: datos.identificador,
    id_tipo_vehiculo: ID_TIPO_VEHICULO[datos.tipoVehiculo],
    sector: datos.sector || undefined,
    cubierta: datos.cubierta,
    estado_actual: datos.estado,
  };
}

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
    foto: dto.foto_url ?? null,
    fotoMiniatura: dto.foto_miniatura_url ?? null,
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
    codigoAcceso: dto.codigo_acceso,
    devuelto: dto.devuelto ?? 0,
    reclamoAbierto: dto.reclamo_abierto ?? null,
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
  if (datos.modalidad === 'HORA') return aInstante(datos.fecha, datos.horaHasta ?? datos.horaDesde);
  const horas = HORAS_POR_MODALIDAD[datos.modalidad];
  return new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
}

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

export function aPlanAbono(dto: PlanAbonoDto): PlanAbono {
  return {
    id: dto.id_plan,
    estacionamientoId: dto.id_estacionamiento,
    turno: dto.turno,
    cupos: dto.cupos,
    precio: dto.precio,
  };
}

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
    devuelto: dto.devuelto ?? 0,
    reclamoAbierto: dto.reclamo_abierto ?? null,
  };
}

export function aPayloadReservaConAbono(datos: NuevaReservaConAbono) {
  return {
    id_abono: datos.abonoId,
    id_vehiculo: datos.vehiculoId,
    inicio: aInstante(datos.fecha, datos.horaDesde),
    fin: aInstante(datos.fecha, datos.horaHasta),
  };
}

export function aIncidencia(dto: IncidenciaDto): Incidencia {
  return {
    id: dto.id_incidencia,
    tipo: dto.tipo,
    estado: dto.estado,
    creadaEn: dto.created_at,
    denunciadaEn: dto.denunciada_at,
    denunciadaPor: dto.denunciada_por ?? null,
    resueltaEn: dto.resuelta_at,
    reserva:
      dto.id_reserva && dto.inicio && dto.fin && dto.estado_reserva
        ? {
            id: dto.id_reserva,
            inicio: dto.inicio,
            fin: dto.fin,
            estado: dto.estado_reserva,
            egresoEn: dto.egreso_real,
          }
        : null,
    abono:
      dto.id_abono && dto.abono_desde && dto.abono_hasta && dto.abono_turno
        ? { id: dto.id_abono, desde: dto.abono_desde, hasta: dto.abono_hasta, turno: dto.abono_turno }
        : null,
    conductor: { id: dto.id_conductor, nombre: `${dto.conductor_nombre} ${dto.conductor_apellido}`.trim() },
    patente: dto.patente,
    cochera: dto.cochera,
    estacionamiento: { id: dto.id_estacionamiento, nombre: dto.estacionamiento },
    cantidadMensajes: dto.cantidad_mensajes ?? 0,
    ultimoMensaje: dto.ultimo_mensaje ?? null,
    motivo: dto.motivo ?? null,
    montoPedido: dto.monto_pedido ?? null,
    propuestaVigente: dto.propuesta_vigente ?? null,
    pagado: dto.pagado ?? 0,
    devuelto: dto.devuelto ?? 0,
    tope: dto.tope ?? 0,
    resolucion: dto.resolucion ?? null,
  };
}

export function aMensajeIncidencia(dto: MensajeIncidenciaDto): MensajeIncidencia {
  const autor = [dto.autor_nombre, dto.autor_apellido].filter(Boolean).join(' ');
  return {
    id: dto.id_mensaje,
    canal: dto.canal ?? 'GENERAL',
    rolAutor: dto.rol_autor,
    autor: autor || null,
    texto: dto.texto,
    creadoEn: dto.created_at,
    montoPropuesto: dto.monto_propuesto ?? null,
  };
}

export function aIncidenciaDetallada(dto: IncidenciaDetalladaDto): IncidenciaDetallada {
  return {
    ...aIncidencia(dto),
    canales: dto.canales ?? ['GENERAL'],
    mensajes: dto.mensajes.map(aMensajeIncidencia),
  };
}

export function aIncidenciaModerada(dto: IncidenciaModeradaDto): IncidenciaModerada {
  const r = dto.resumen ?? {};
  return {
    ...aIncidenciaDetallada(dto),
    resumen: {
      inicio: r.inicio,
      fin: r.fin,
      ingresoEn: r.ingreso_real,
      egresoEn: r.egreso_real,
      estadoReserva: r.estado_reserva,
      canceladaPor: r.cancelada_por,
      desde: r.desde,
      hasta: r.hasta,
    },
  };
}

export function aPayloadReclamo(datos: NuevoReclamo) {
  return {
    ...(datos.reservaId ? { id_reserva: datos.reservaId } : { id_abono: datos.abonoId }),
    motivo: datos.motivo,
    ...(datos.montoPedido !== undefined ? { monto_pedido: datos.montoPedido } : {}),
    texto: datos.texto,
  };
}
