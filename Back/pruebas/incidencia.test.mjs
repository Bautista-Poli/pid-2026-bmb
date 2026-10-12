// Auto excedido (la cochera queda bloqueada hasta el egreso), reasignacion de
// la reserva siguiente e incidencias con su hilo de mensajes.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';
import { detectarExcedidos, protegerReservasSiguientes } from '../src/services/incidencia.service.js';

before(() => levantarApi('incidencia'));
after(() => cerrarApi());

async function reservar(conductor, vehiculo, estacionamiento, cuando = franja()) {
  const { datos, estado } = await api('POST', '/reservas', {
    token: conductor.token,
    body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...cuando },
  });
  return { reserva: datos?.reserva, estado, datos };
}

const confirmar = (propietario, reserva) =>
  api('PATCH', `/reservas/${reserva.id_reserva}/confirmar`, { token: propietario.token });

const acceder = (propietario, codigo) =>
  api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } });

/** Mueve la franja: empezo hace `desde` minutos y termina a `hasta` minutos de ahora (negativo = ya paso). */
const moverFranja = (idReserva, desde, hasta) =>
  query(
    `UPDATE reserva SET inicio = now() - make_interval(mins => $2), fin = now() + make_interval(mins => $3)
      WHERE id_reserva = $1`,
    [idReserva, desde, hasta],
  );

/**
 * Un auto adentro que se paso de su horario hace `minutosExcedido` minutos:
 * reserva confirmada, ingreso por codigo y la franja corrida al pasado.
 */
async function escenarioExcedido({ cocheras = 1, minutosExcedido = 20 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const { reserva } = await reservar(conductor, vehiculo, estacionamiento);
  await confirmar(propietario, reserva);
  await moverFranja(reserva.id_reserva, 5, 55);
  await acceder(propietario, reserva.codigo_acceso);
  await query(
    `UPDATE reserva SET inicio = now() - interval '2 hours', fin = now() - make_interval(mins => $2),
            ingreso_real = now() - interval '2 hours'
      WHERE id_reserva = $1`,
    [reserva.id_reserva, minutosExcedido],
  );
  return { propietario, estacionamiento, conductor, vehiculo, reserva };
}

const estadoDe = async (idReserva) =>
  (await query('SELECT estado::text AS estado, id_cochera, motivo_reasignacion FROM reserva WHERE id_reserva = $1', [
    idReserva,
  ])).rows[0];

const incidenciasDe = async (idReserva) =>
  (await query('SELECT id_incidencia, tipo::text AS tipo FROM incidencia WHERE id_reserva = $1', [idReserva])).rows;

describe('auto excedido', () => {
  test('la reserva no se cierra sola y la cochera no se puede reservar hasta el egreso', async () => {
    const { propietario, estacionamiento, reserva } = await escenarioExcedido();
    const otro = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otro.token);

    await detectarExcedidos();
    assert.equal((await estadoDe(reserva.id_reserva)).estado, 'ACTIVA');

    // Unica cochera: ni manana se puede reservar mientras el auto siga adentro.
    const bloqueada = await reservar(otro, otroVehiculo, estacionamiento);
    assert.equal(bloqueada.estado, 409);

    await acceder(propietario, reserva.codigo_acceso);
    const libre = await reservar(otro, otroVehiculo, estacionamiento);
    assert.equal(libre.estado, 201);
  });

  test('la disponibilidad tampoco la ofrece', async () => {
    const { estacionamiento } = await escenarioExcedido();
    const fecha = franja().inicio.slice(0, 10);

    const { datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/disponibilidad?fecha=${fecha}`,
    );

    assert.ok(datos.franjas.every((f) => f.cocheras_libres === 0));
  });

  test('pasado el margen se abre una incidencia AUTO_EXCEDIDO, una sola vez', async () => {
    const { reserva } = await escenarioExcedido({ minutosExcedido: 20 });

    await detectarExcedidos();
    await detectarExcedidos();

    const incidencias = await incidenciasDe(reserva.id_reserva);
    assert.deepEqual(incidencias.map((i) => i.tipo), ['AUTO_EXCEDIDO']);
  });

  test('dentro del margen no hay incidencia (aunque la cochera ya esta bloqueada)', async () => {
    const { reserva } = await escenarioExcedido({ minutosExcedido: 5 });

    await detectarExcedidos();

    assert.equal((await incidenciasDe(reserva.id_reserva)).length, 0);
  });

  test('el egreso deja constancia en la incidencia', async () => {
    const { propietario, reserva } = await escenarioExcedido();
    await detectarExcedidos();

    await acceder(propietario, reserva.codigo_acceso);

    const [{ id_incidencia }] = await incidenciasDe(reserva.id_reserva);
    const { datos } = await api('GET', `/incidencias/${id_incidencia}`, { token: propietario.token });
    assert.match(datos.incidencia.mensajes.at(-1).texto, /egreso/i);
    assert.equal(datos.incidencia.estado, 'ABIERTA');
  });
});

describe('reserva siguiente en una cochera ocupada', () => {
  /** Reserva confirmada en la misma cochera, pasado manana (despues se la mueve). */
  async function siguiente({ propietario, estacionamiento, reserva }) {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_cochera: reserva.id_cochera, id_vehiculo: vehiculo.id_vehiculo, ...franja('14:00', '16:00', 2) },
    });
    await confirmar(propietario, datos.reserva);
    return datos.reserva;
  }

  async function excedidoConSiguiente(cocheras) {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const { reserva } = await reservar(conductor, vehiculo, estacionamiento);
    await confirmar(propietario, reserva);
    // La siguiente se reserva antes de que el auto se exceda (despues ya no se
    // podria: la cochera queda bloqueada). Recien cuando el auto ya se paso de
    // su horario se la trae a "empieza en 10 minutos".
    const proxima = await siguiente({ propietario, estacionamiento, reserva });
    await moverFranja(reserva.id_reserva, 5, 55);
    await acceder(propietario, reserva.codigo_acceso);
    await query(
      `UPDATE reserva SET inicio = now() - interval '2 hours', fin = now() - interval '5 minutes' WHERE id_reserva = $1`,
      [reserva.id_reserva],
    );
    await moverFranja(proxima.id_reserva, -10, 70);
    return { propietario, reserva, proxima };
  }

  test('con otra cochera libre se reasigna y se le avisa al conductor', async () => {
    const { reserva, proxima } = await excedidoConSiguiente(2);

    const resultado = await protegerReservasSiguientes();

    const movida = await estadoDe(proxima.id_reserva);
    assert.ok(resultado.reasignadas >= 1);
    assert.notEqual(movida.id_cochera, reserva.id_cochera);
    assert.match(movida.motivo_reasignacion, /reasignamos/i);
    assert.equal((await incidenciasDe(proxima.id_reserva)).length, 0);
  });

  test('sin otra cochera queda donde esta, con aviso e incidencia RESERVA_AFECTADA (una sola)', async () => {
    const { reserva, proxima } = await excedidoConSiguiente(1);

    await protegerReservasSiguientes();
    await protegerReservasSiguientes();

    const afectada = await estadoDe(proxima.id_reserva);
    assert.equal(afectada.id_cochera, reserva.id_cochera);
    assert.match(afectada.motivo_reasignacion, /sigue ocupada/i);
    assert.deepEqual((await incidenciasDe(proxima.id_reserva)).map((i) => i.tipo), ['RESERVA_AFECTADA']);
  });
});

describe('incidencias: hilo, resolver y denunciar', () => {
  async function conIncidencia() {
    const datos = await escenarioExcedido();
    await detectarExcedidos();
    const [{ id_incidencia }] = await incidenciasDe(datos.reserva.id_reserva);
    return { ...datos, id: id_incidencia };
  }

  test('la ven el propietario y el conductor de la reserva; otro usuario no', async () => {
    const { propietario, conductor, id } = await conIncidencia();
    const ajeno = await crearUsuario({ rol: 'PROPIETARIO' });

    const delPropietario = await api('GET', '/incidencias', { token: propietario.token });
    const delConductor = await api('GET', '/incidencias', { token: conductor.token });
    const delAjeno = await api('GET', `/incidencias/${id}`, { token: ajeno.token });

    assert.ok(delPropietario.datos.incidencias.some((i) => i.id_incidencia === id));
    assert.ok(delConductor.datos.incidencias.some((i) => i.id_incidencia === id));
    assert.equal(delAjeno.estado, 404);
  });

  test('ida y vuelta: los mensajes quedan en orden con quien los escribio', async () => {
    const { propietario, conductor, id } = await conIncidencia();

    await api('POST', `/incidencias/${id}/mensajes`, {
      token: propietario.token,
      body: { texto: 'Tu auto sigue en la cochera, ¿cuándo pasás?' },
    });
    const respuesta = await api('POST', `/incidencias/${id}/mensajes`, {
      token: conductor.token,
      body: { texto: 'En 20 minutos lo retiro' },
    });

    assert.equal(respuesta.estado, 201);
    const roles = respuesta.datos.incidencia.mensajes.map((m) => m.rol_autor);
    assert.deepEqual(roles, ['SISTEMA', 'PROPIETARIO', 'CONDUCTOR']);
  });

  test('el propietario la resuelve; despues no se puede escribir', async () => {
    const { propietario, conductor, id } = await conIncidencia();

    const delConductor = await api('PATCH', `/incidencias/${id}/resolver`, { token: conductor.token, body: {} });
    const resuelta = await api('PATCH', `/incidencias/${id}/resolver`, {
      token: propietario.token,
      body: { comentario: 'Ya lo retiró' },
    });
    const tarde = await api('POST', `/incidencias/${id}/mensajes`, { token: conductor.token, body: { texto: 'hola' } });

    assert.equal(delConductor.estado, 403);
    assert.equal(resuelta.datos.incidencia.estado, 'RESUELTA');
    assert.ok(resuelta.datos.incidencia.resuelta_at);
    assert.equal(tarde.estado, 409);
  });

  test('denunciar pide un motivo y la pasa a DENUNCIADA una sola vez', async () => {
    const { propietario, id } = await conIncidencia();

    const sinMotivo = await api('PATCH', `/incidencias/${id}/denunciar`, { token: propietario.token, body: {} });
    const denunciada = await api('PATCH', `/incidencias/${id}/denunciar`, {
      token: propietario.token,
      body: { motivo: 'Dejó el auto toda la noche sin avisar' },
    });
    const otraVez = await api('PATCH', `/incidencias/${id}/denunciar`, {
      token: propietario.token,
      body: { motivo: 'Dejó el auto toda la noche sin avisar' },
    });

    assert.equal(sinMotivo.estado, 400);
    assert.equal(denunciada.datos.incidencia.estado, 'DENUNCIADA');
    assert.equal(otraVez.estado, 409);
    assert.match(motivo(otraVez), /ya fue denunciada/i);
  });
});

describe('chats: general y privados con la moderacion', () => {
  async function conIncidencia() {
    const datos = await escenarioExcedido();
    await detectarExcedidos();
    const [{ id_incidencia }] = await incidenciasDe(datos.reserva.id_reserva);
    return { ...datos, id: id_incidencia };
  }

  const ver = (usuario, id) => api('GET', `/incidencias/${id}`, { token: usuario.token });
  const escribir = (usuario, id, texto, canal) =>
    api('POST', `/incidencias/${id}/mensajes`, { token: usuario.token, body: { texto, canal } });
  const denunciar = (usuario, id, motivo) =>
    api('PATCH', `/incidencias/${id}/denunciar`, { token: usuario.token, body: { motivo } });

  test('antes de la denuncia solo existe el chat general', async () => {
    const { propietario, id } = await conIncidencia();

    const { datos } = await ver(propietario, id);
    const privado = await escribir(propietario, id, 'Hola moderacion', 'PROPIETARIO');

    assert.deepEqual(datos.incidencia.canales, ['GENERAL']);
    assert.equal(privado.estado, 409);
  });

  test('el conductor tambien puede denunciar; el motivo no lo ve el propietario', async () => {
    const { propietario, conductor, id } = await conIncidencia();

    const denuncia = await denunciar(conductor, id, 'El estacionamiento no me dejó sacar el auto');

    assert.equal(denuncia.estado, 200);
    assert.equal(denuncia.datos.incidencia.estado, 'DENUNCIADA');
    assert.equal(denuncia.datos.incidencia.denunciada_por, 'CONDUCTOR');
    assert.deepEqual(denuncia.datos.incidencia.canales, ['GENERAL', 'CONDUCTOR']);

    const { datos } = await ver(propietario, id);
    assert.deepEqual(datos.incidencia.canales, ['GENERAL', 'PROPIETARIO']);
    const textos = datos.incidencia.mensajes.map((m) => m.texto).join(' | ');
    assert.doesNotMatch(textos, /no me dejó sacar el auto/);
    // Se entera de que hay denuncia (aviso en el general y en su privado), sin el motivo.
    assert.ok(datos.incidencia.mensajes.some((m) => m.canal === 'GENERAL' && /moderacion/i.test(m.texto)));
    assert.ok(datos.incidencia.mensajes.some((m) => m.canal === 'PROPIETARIO'));
  });

  test('cada parte escribe solo en su chat privado y no ve el del otro', async () => {
    const { propietario, conductor, id } = await conIncidencia();
    await denunciar(propietario, id, 'Dejó el auto toda la noche sin avisar');

    const propio = await escribir(propietario, id, 'Adjunto más detalles', 'PROPIETARIO');
    const ajeno = await escribir(propietario, id, 'Me meto en el otro', 'CONDUCTOR');
    await escribir(conductor, id, 'Yo tuve un problema con el auto', 'CONDUCTOR');
    // El general sigue abierto para que lo arreglen entre ellos.
    const general = await escribir(conductor, id, '¿Lo hablamos?', 'GENERAL');

    assert.equal(propio.estado, 201);
    assert.equal(ajeno.estado, 403);
    assert.equal(general.estado, 201);

    const delPropietario = (await ver(propietario, id)).datos.incidencia.mensajes;
    const delConductor = (await ver(conductor, id)).datos.incidencia.mensajes;
    assert.ok(delPropietario.every((m) => m.canal !== 'CONDUCTOR'));
    assert.ok(delConductor.every((m) => m.canal !== 'PROPIETARIO'));
    assert.ok(delPropietario.some((m) => m.texto === '¿Lo hablamos?'));
    assert.ok(!delConductor.some((m) => /toda la noche/.test(m.texto)));
  });

  test('una vez denunciada, el propietario ya no la puede resolver (la cierra la moderacion)', async () => {
    const { propietario, id } = await conIncidencia();
    await denunciar(propietario, id, 'Dejó el auto toda la noche sin avisar');

    const intento = await api('PATCH', `/incidencias/${id}/resolver`, { token: propietario.token, body: {} });

    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /moderacion/i);
  });

  test('la lista cuenta solo los mensajes que la parte puede ver', async () => {
    const { propietario, conductor, id } = await conIncidencia();
    await denunciar(conductor, id, 'El estacionamiento no me dejó sacar el auto');

    const lista = (await api('GET', '/incidencias', { token: propietario.token })).datos.incidencias;
    const detalle = (await ver(propietario, id)).datos.incidencia;
    const fila = lista.find((i) => i.id_incidencia === id);

    assert.equal(fila.cantidad_mensajes, detalle.mensajes.length);
    assert.doesNotMatch(fila.ultimo_mensaje, /no me dejó sacar/);
  });
});
