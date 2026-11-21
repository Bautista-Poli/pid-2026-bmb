// Auto excedido (la cochera queda bloqueada hasta el egreso) y reasignacion de
// la reserva siguiente.
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
  query,
} from './ayuda.mjs';
import { protegerReservasSiguientes } from '../src/services/reserva/reserva-vencimientos.service.js';

before(() => levantarApi('excedido'));
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

describe('auto excedido', () => {
  test('la reserva no se cierra sola y la cochera no se puede reservar hasta el egreso', async () => {
    const { propietario, estacionamiento, reserva } = await escenarioExcedido();
    const otro = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otro.token);

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
  });

  test('sin otra cochera queda donde esta, con aviso para el conductor', async () => {
    const { reserva, proxima } = await excedidoConSiguiente(1);

    await protegerReservasSiguientes();
    await protegerReservasSiguientes();

    const afectada = await estadoDe(proxima.id_reserva);
    assert.equal(afectada.id_cochera, reserva.id_cochera);
    assert.match(afectada.motivo_reasignacion, /sigue ocupada/i);
  });
});
