// Ingreso y egreso con el codigo (QR) de la reserva.
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
  ponerEnCurso,
  query,
} from './ayuda.mjs';

before(() => levantarApi('acceso'));
after(() => cerrarApi());

const FORMATO_CODIGO = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/** Reserva de manana (08:00 a 10:00), confirmada por el propietario. */
async function escenario({ cocheras = 1 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const reserva = await reservaConfirmada(propietario, conductor, estacionamiento, vehiculo);
  return { propietario, estacionamiento, conductor, vehiculo, reserva };
}

async function reservaConfirmada(propietario, conductor, estacionamiento, vehiculo, cuando = franja()) {
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...cuando,
    },
  });
  const confirmada = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, {
    token: propietario.token,
  });
  return confirmada.datos.reserva;
}

describe('codigo de la reserva', () => {
  test('cada reserva nace con su codigo, distinto del de las demas', async () => {
    const { propietario, estacionamiento, conductor, reserva } = await escenario({ cocheras: 2 });
    const otroVehiculo = await crearVehiculo(conductor.token);
    const otra = await reservaConfirmada(propietario, conductor, estacionamiento, otroVehiculo);

    assert.match(reserva.codigo_acceso, FORMATO_CODIGO);
    assert.match(otra.codigo_acceso, FORMATO_CODIGO);
    assert.notEqual(reserva.codigo_acceso, otra.codigo_acceso);
  });

  test('lo ven el conductor en sus reservas y el propietario en las recibidas', async () => {
    const { propietario, estacionamiento, conductor, reserva } = await escenario();

    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);

    const recibidas = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reservas`,
      { token: propietario.token },
    );
    assert.equal(recibidas.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);
  });
});
