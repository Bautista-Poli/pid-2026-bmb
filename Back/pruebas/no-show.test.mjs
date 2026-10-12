// No-show: una reserva CONFIRMADA sin ingreso pasada la tolerancia queda como
// NO_SHOW y la cochera vuelve a estar disponible.
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
import {
  TOLERANCIA_NO_SHOW_MS,
  vencerNoPresentadas,
  vencerPendientesSinConfirmar,
} from '../src/services/reserva.service.js';

before(() => levantarApi('noshow'));
after(() => cerrarApi());

const MINUTOS_TOLERANCIA = TOLERANCIA_NO_SHOW_MS / 60_000;

/** Reserva de manana confirmada, en un estacionamiento de una sola cochera. */
async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 1 });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);

  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...franja(),
    },
  });
  const confirmada = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, {
    token: propietario.token,
  });

  return { propietario, estacionamiento, conductor, reserva: confirmada.datos.reserva };
}

/** Corre la franja para que haya empezado hace `minutos` y dure una hora. */
const empezoHace = (idReserva, minutos) =>
  query(
    `UPDATE reserva
        SET inicio = now() - make_interval(mins => $2),
            fin    = now() - make_interval(mins => $2) + interval '1 hour'
      WHERE id_reserva = $1`,
    [idReserva, minutos],
  );

const estadoDe = async (idReserva) =>
  (await query('SELECT estado::text AS estado FROM reserva WHERE id_reserva = $1', [idReserva])).rows[0]
    .estado;

const libresAhora = async (estacionamiento) => {
  const { datos } = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}`);
  return datos.estacionamiento.cocheras_libres;
};

const acceder = (propietario, codigo) =>
  api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } });

describe('pasaje automatico a NO_SHOW', () => {
  test('pasada la tolerancia sin ingreso: NO_SHOW y la cochera vuelve a estar libre', async () => {
    const { estacionamiento, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);
    assert.equal(await libresAhora(estacionamiento), 0);

    await vencerNoPresentadas();

    assert.equal(await estadoDe(reserva.id_reserva), 'NO_SHOW');
    assert.equal(await libresAhora(estacionamiento), 1);
  });

  test('dentro de la tolerancia no la toca', async () => {
    const { reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA - 5);

    await vencerNoPresentadas();

    assert.equal(await estadoDe(reserva.id_reserva), 'CONFIRMADA');
  });

  test('una reserva con ingreso (ACTIVA) no pasa a NO_SHOW', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, 5);
    await acceder(propietario, reserva.codigo_acceso);
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 10);

    await vencerNoPresentadas();

    assert.equal(await estadoDe(reserva.id_reserva), 'ACTIVA');
  });

  test('libera la franja para una reserva nueva sobre la misma cochera', async () => {
    const { estacionamiento, reserva } = await escenario();
    const cuando = franja();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);
    await vencerNoPresentadas();
    // La franja original de manana queda libre: se vuelve a poner ahi y se reserva encima.
    await query('UPDATE reserva SET inicio = $2, fin = $3 WHERE id_reserva = $1', [
      reserva.id_reserva,
      cuando.inicio,
      cuando.fin,
    ]);

    const otro = await crearUsuario();
    const vehiculo = await crearVehiculo(otro.token);
    const nueva = await api('POST', '/reservas', {
      token: otro.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...cuando,
      },
    });

    assert.equal(nueva.estado, 201);
    assert.equal(nueva.datos.reserva.id_cochera, reserva.id_cochera);
  });
});

describe('ingreso y cancelacion fuera de la tolerancia', () => {
  test('el codigo no registra el ingreso pasada la tolerancia, aunque el job no haya corrido', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);

    const previa = await api('GET', `/reservas/acceso/${reserva.codigo_acceso}`, {
      token: propietario.token,
    });
    const intento = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(previa.estado, 409);
    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /tolerancia/i);
    assert.equal(await estadoDe(reserva.id_reserva), 'CONFIRMADA');
  });

  test('el boton de ingreso del propietario tambien respeta la tolerancia', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);

    const intento = await api('PATCH', `/reservas/${reserva.id_reserva}/ingreso`, {
      token: propietario.token,
    });

    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /tolerancia/i);
  });

  test('dentro de la tolerancia el ingreso se registra', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA - 1);

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.reserva.estado, 'ACTIVA');
  });

  test('el codigo de una reserva NO_SHOW explica por que no entra', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);
    await vencerNoPresentadas();

    const intento = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /no presentada/i);
  });

  test('el conductor no puede cancelar pasada la tolerancia', async () => {
    const { conductor, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, MINUTOS_TOLERANCIA + 1);

    const intento = await api('PATCH', `/reservas/${reserva.id_reserva}/cancelar`, {
      token: conductor.token,
    });

    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /no presentada/i);
    assert.equal(await estadoDe(reserva.id_reserva), 'CONFIRMADA');
  });
});

describe('quien cancelo la reserva', () => {
  test('el conductor cancela: cancelada_por CONDUCTOR', async () => {
    const { conductor, reserva } = await escenario();

    const { datos } = await api('PATCH', `/reservas/${reserva.id_reserva}/cancelar`, {
      token: conductor.token,
    });

    assert.equal(datos.reserva.estado, 'CANCELADA');
    assert.equal(datos.reserva.cancelada_por, 'CONDUCTOR');
  });

  test('una PENDIENTE que nadie confirmo y ya empezo: cancelada_por SISTEMA', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...franja(),
      },
    });
    await empezoHace(datos.reserva.id_reserva, 1);

    await vencerPendientesSinConfirmar();

    const mias = await api('GET', '/reservas', { token: conductor.token });
    const vencida = mias.datos.reservas.find((r) => r.id_reserva === datos.reserva.id_reserva);
    assert.equal(vencida.estado, 'CANCELADA');
    assert.equal(vencida.cancelada_por, 'SISTEMA');
  });

  test('el propietario da de baja la cochera: cancelada_por PROPIETARIO', async () => {
    const { propietario, estacionamiento, reserva } = await escenario();

    await api(
      'DELETE',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras/${reserva.id_cochera}`,
      { token: propietario.token },
    );

    const { rows } = await query('SELECT cancelada_por::text AS origen FROM reserva WHERE id_reserva = $1', [
      reserva.id_reserva,
    ]);
    assert.equal(rows[0].origen, 'PROPIETARIO');
  });

  test('una reserva que no se cancelo no trae origen', async () => {
    const { reserva } = await escenario();
    assert.equal(reserva.cancelada_por, null);
  });
});

describe('ausente a mano', () => {
  const marcar = (usuario, reserva) =>
    api('PATCH', `/reservas/${reserva.id_reserva}/ausente`, { token: usuario.token });

  test('ya empezada y sin ingreso: el propietario la marca NO_SHOW y libera la cochera', async () => {
    const { propietario, estacionamiento, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, 2);
    assert.equal(await libresAhora(estacionamiento), 0);

    const { estado, datos } = await marcar(propietario, reserva);

    assert.equal(estado, 200);
    assert.equal(datos.reserva.estado, 'NO_SHOW');
    assert.equal(await libresAhora(estacionamiento), 1);
  });

  test('antes del inicio no se puede (todavia puede llegar)', async () => {
    const { propietario, reserva } = await escenario();

    const intento = await marcar(propietario, reserva);

    assert.equal(intento.estado, 409);
    assert.match(motivo(intento), /empieza a las/i);
    assert.equal(await estadoDe(reserva.id_reserva), 'CONFIRMADA');
  });

  test('con el auto adentro (ACTIVA) no se puede', async () => {
    const { propietario, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, 2);
    await acceder(propietario, reserva.codigo_acceso);

    const intento = await marcar(propietario, reserva);

    assert.equal(intento.estado, 409);
    assert.equal(await estadoDe(reserva.id_reserva), 'ACTIVA');
  });

  test('ni el conductor ni otro propietario pueden marcarla', async () => {
    const { conductor, reserva } = await escenario();
    await empezoHace(reserva.id_reserva, 2);
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });

    assert.equal((await marcar(conductor, reserva)).estado, 403);
    assert.equal((await marcar(otro, reserva)).estado, 403);
    assert.equal(await estadoDe(reserva.id_reserva), 'CONFIRMADA');
  });
});
