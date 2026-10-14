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
    assert.match(mias.datos.reservas[0].codigo_acceso, FORMATO_CODIGO);
    assert.equal(mias.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);

    const recibidas = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reservas`,
      { token: propietario.token },
    );
    assert.equal(recibidas.datos.reservas[0].codigo_acceso, reserva.codigo_acceso);
  });
});

const acceder = (propietario, codigo) =>
  api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } });

const estadoCochera = async (idCochera) =>
  (await query('SELECT estado_actual FROM cochera WHERE id_cochera = $1', [idCochera])).rows[0]
    .estado_actual;

/** Corre el ingreso_real hacia atras para pasar el margen anti doble escaneo. */
const ingresoHaceUnRato = (idReserva) =>
  query(`UPDATE reserva SET ingreso_real = now() - interval '10 minutes' WHERE id_reserva = $1`, [
    idReserva,
  ]);

describe('ingreso y egreso con el codigo de la reserva', () => {
  test('ingreso en la ventana: ACTIVA y cochera OCUPADA', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'INGRESO');
    assert.equal(datos.reserva.estado, 'ACTIVA');
    assert.ok(datos.reserva.ingreso_real);
    assert.equal(await estadoCochera(reserva.id_cochera), 'OCUPADA');
  });

  test('egreso con el mismo codigo: FINALIZADA y cochera LIBRE', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);
    await ingresoHaceUnRato(reserva.id_reserva);

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
    assert.equal(datos.reserva.estado, 'FINALIZADA');
    assert.equal(await estadoCochera(reserva.id_cochera), 'LIBRE');
  });

  test('doble escaneo: el segundo no registra el egreso enseguida', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);

    const segundo = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(segundo.estado, 409);
    assert.match(motivo(segundo), /acabas de registrar el ingreso/i);
  });

  test('egreso aunque la franja ya haya terminado', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    await acceder(propietario, reserva.codigo_acceso);
    await query(
      `UPDATE reserva SET inicio = now() - interval '3 hours', fin = now() - interval '10 minutes',
              ingreso_real = now() - interval '3 hours'
        WHERE id_reserva = $1`,
      [reserva.id_reserva],
    );

    const { estado, datos } = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'EGRESO');
  });

  test('el codigo se acepta en minusculas y con guion', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const c = reserva.codigo_acceso;

    const { estado } = await acceder(propietario, `${c.slice(0, 4)}-${c.slice(4)}`.toLowerCase());

    assert.equal(estado, 200);
  });

  test('vista previa: dice que se va a registrar sin registrar nada', async () => {
    const { propietario, reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);

    const { estado, datos } = await api('GET', `/reservas/acceso/${reserva.codigo_acceso}`, {
      token: propietario.token,
    });

    assert.equal(estado, 200);
    assert.equal(datos.accion, 'INGRESO');
    assert.equal(datos.reserva.id_reserva, reserva.id_reserva);
    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [reserva.id_reserva]);
    assert.equal(rows[0].estado, 'CONFIRMADA');
  });

  test('codigo inexistente, mal formado o basura: 400 o 404, nunca 500', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });

    for (const codigo of ['ZZZZZZZZ', 'K7MQ2XT0', "' OR 1=1", 'x'.repeat(50)]) {
      const respuesta = await acceder(propietario, codigo);
      assert.ok([400, 404].includes(respuesta.estado), `${codigo}: ${respuesta.estado}`);
    }
    const sinCodigo = await api('POST', '/reservas/acceso', { token: propietario.token, body: {} });
    assert.equal(sinCodigo.estado, 400);
  });

  test('codigo de una reserva de otro propietario: 404 con el mismo mensaje', async () => {
    const { reserva } = await escenario();
    await ponerEnCurso(reserva.id_reserva);
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });

    const ajena = await acceder(otro, reserva.codigo_acceso);
    const inexistente = await acceder(otro, 'ZZZZZZZZ');

    assert.equal(ajena.estado, 404);
    assert.equal(motivo(ajena), motivo(inexistente));
  });

  test('reserva pendiente: todavia no esta confirmada', async () => {
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
    await ponerEnCurso(datos.reserva.id_reserva);

    const respuesta = await acceder(propietario, datos.reserva.codigo_acceso);

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /todavia no esta confirmada/i);
  });

  test('reserva cancelada o finalizada: 409', async () => {
    const { propietario, conductor, reserva } = await escenario();
    await api('PATCH', `/reservas/${reserva.id_reserva}/cancelar`, { token: conductor.token });

    const cancelada = await acceder(propietario, reserva.codigo_acceso);
    assert.equal(cancelada.estado, 409);
    assert.match(motivo(cancelada), /cancelada/i);

    const otra = await escenario();
    await ponerEnCurso(otra.reserva.id_reserva);
    await acceder(otra.propietario, otra.reserva.codigo_acceso);
    await ingresoHaceUnRato(otra.reserva.id_reserva);
    await acceder(otra.propietario, otra.reserva.codigo_acceso);

    const finalizada = await acceder(otra.propietario, otra.reserva.codigo_acceso);
    assert.equal(finalizada.estado, 409);
    assert.match(motivo(finalizada), /ya termino/i);
  });

  test('demasiado temprano: dice desde que hora se puede ingresar', async () => {
    const { propietario, reserva } = await escenario(); // manana de 08:00 a 10:00

    const respuesta = await acceder(propietario, reserva.codigo_acceso);

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /empieza a las 08:00; se puede ingresar desde las 07:30/i);
  });

  test('un conductor no puede usar los endpoints de acceso', async () => {
    const { conductor, reserva } = await escenario();

    assert.equal((await acceder(conductor, reserva.codigo_acceso)).estado, 403);
    const previa = await api('GET', `/reservas/acceso/${reserva.codigo_acceso}`, { token: conductor.token });
    assert.equal(previa.estado, 403);
  });
});
