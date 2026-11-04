// Calificacion del conductor por el propietario: solo sobre reservas
// finalizadas o ausentes de un estacionamiento propio, una vez y dentro del
// plazo. Y la reputacion del conductor que sale de esas calificaciones.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cambiarRol,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';

before(() => levantarApi('calificacion-conductor'));
after(() => cerrarApi());

async function reservar(propietario, conductor, estacionamiento, cuando = franja()) {
  const vehiculo = await crearVehiculo(conductor.token);
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...cuando },
  });
  await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, { token: propietario.token });
  return datos.reserva;
}

/** Deja la reserva usada (entro y salio) sin pasar por el QR. */
function marcarUsada(idReserva, { egresoHace = '1 hour' } = {}) {
  return query(
    `UPDATE reserva
        SET estado = 'FINALIZADA',
            inicio = now() - interval '3 hours' - $2::interval,
            fin = now() - $2::interval,
            ingreso_real = now() - interval '3 hours' - $2::interval,
            egreso_real = now() - $2::interval
      WHERE id_reserva = $1`,
    [idReserva, egresoHace],
  );
}

/** Deja la reserva como ausente (el conductor no llego). */
function marcarAusente(idReserva, { finHace = '1 hour' } = {}) {
  return query(
    `UPDATE reserva
        SET estado = 'NO_SHOW',
            inicio = now() - interval '2 hours' - $2::interval,
            fin = now() - $2::interval
      WHERE id_reserva = $1`,
    [idReserva, finHace],
  );
}

async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 3 });
  const conductor = await crearUsuario();
  return { propietario, estacionamiento, conductor };
}

const calificarConductor = (propietario, idReserva, body = { puntaje: 4, etiquetas: ['PUNTUAL'] }) =>
  api('POST', `/reservas/${idReserva}/calificacion-conductor`, { token: propietario.token, body });

describe('el propietario califica al conductor', () => {
  test('una finalizada: 201 y no se puede repetir', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const primera = await calificarConductor(propietario, reserva.id_reserva);
    assert.equal(primera.estado, 201);
    assert.equal(primera.datos.calificacion.puntaje, 4);
    assert.deepEqual(primera.datos.calificacion.etiquetas, ['PUNTUAL']);

    const segunda = await calificarConductor(propietario, reserva.id_reserva);
    assert.equal(segunda.estado, 409);
    assert.match(motivo(segunda), /Ya calificaste/);
  });

  test('una ausente tambien se califica', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarAusente(reserva.id_reserva);

    assert.equal((await calificarConductor(propietario, reserva.id_reserva)).estado, 201);
  });

  test('una confirmada sin usar no se califica', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);

    const respuesta = await calificarConductor(propietario, reserva.id_reserva);
    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /finalizada o ausente/);
  });

  test('una cancelada no se califica', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await api('PATCH', `/reservas/${reserva.id_reserva}/cancelar`, { token: conductor.token });

    const respuesta = await calificarConductor(propietario, reserva.id_reserva);
    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /finalizada o ausente/);
  });

  test('vence a los 7 dias', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const usada = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 1));
    await marcarUsada(usada.id_reserva, { egresoHace: '8 days' });
    const vieja = await calificarConductor(propietario, usada.id_reserva);
    assert.equal(vieja.estado, 409);
    assert.match(motivo(vieja), /plazo/);

    const ausente = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 2));
    await marcarAusente(ausente.id_reserva, { finHace: '8 days' });
    assert.equal((await calificarConductor(propietario, ausente.id_reserva)).estado, 409);
  });

  test('solo el propietario de ese estacionamiento', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    assert.equal((await calificarConductor(otro, reserva.id_reserva)).estado, 403);
    assert.equal((await calificarConductor(conductor, reserva.id_reserva)).estado, 403);
  });

  test('nadie se califica a si mismo (con los dos perfiles, reservando en su estacionamiento)', async () => {
    const dueno = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const estacionamiento = await crearEstacionamiento(dueno.token, { cocheras: 1 });
    const comoConductor = { token: await cambiarRol(dueno.token, 'CONDUCTOR') };
    const comoPropietario = { token: await cambiarRol(comoConductor.token, 'PROPIETARIO') };
    const reserva = await reservar(comoPropietario, comoConductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const respuesta = await calificarConductor(comoPropietario, reserva.id_reserva, { puntaje: 5 });
    assert.equal(respuesta.estado, 403);
    assert.match(motivo(respuesta), /a vos mismo/);
  });

  test('valida puntaje y etiquetas', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);
    const id = reserva.id_reserva;

    assert.equal((await calificarConductor(propietario, id, { puntaje: 0 })).estado, 400);
    assert.equal((await calificarConductor(propietario, id, { puntaje: 6 })).estado, 400);
    assert.equal((await calificarConductor(propietario, id, {})).estado, 400);
    assert.equal((await calificarConductor(propietario, id, { puntaje: 4, etiquetas: ['MUY_LIMPIO'] })).estado, 400);
    assert.equal(
      (await calificarConductor(propietario, id, { puntaje: 4, comentario: 'x'.repeat(501) })).estado,
      400,
    );

    const normalizada = await calificarConductor(propietario, id, {
      puntaje: 4,
      etiquetas: ['puntual', 'PUNTUAL', ' respetuoso '],
    });
    assert.equal(normalizada.estado, 201);
    assert.deepEqual(normalizada.datos.calificacion.etiquetas, ['PUNTUAL', 'RESPETUOSO']);
  });

  test('dos envios a la vez: una sola calificacion', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const estados = (
      await Promise.all([
        calificarConductor(propietario, reserva.id_reserva),
        calificarConductor(propietario, reserva.id_reserva),
      ])
    )
      .map((r) => r.estado)
      .sort();
    assert.deepEqual(estados, [201, 409]);

    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM calificacion WHERE id_reserva = $1 AND autor = 'PROPIETARIO'`,
      [reserva.id_reserva],
    );
    assert.equal(rows[0].n, 1);
  });
});

describe('reputacion del conductor', () => {
  const miReputacion = (conductor) => api('GET', '/reservas/mi-reputacion', { token: conductor.token });

  test('sin calificaciones', async () => {
    const conductor = await crearUsuario();
    const { estado, datos } = await miReputacion(conductor);
    assert.equal(estado, 200);
    assert.deepEqual(datos.reputacion, { promedio: null, cantidad: 0, etiquetas: [], resenas: [] });
  });

  test('promedio, cantidad y etiquetas mas marcadas; el propietario la ve en sus reservas', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const primera = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 1));
    const segunda = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 2));
    const sinCalificar = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 3));
    await marcarUsada(primera.id_reserva);
    await marcarUsada(segunda.id_reserva);
    await marcarUsada(sinCalificar.id_reserva);
    await calificarConductor(propietario, primera.id_reserva, { puntaje: 5, etiquetas: ['PUNTUAL', 'RESPETUOSO'] });
    await calificarConductor(propietario, segunda.id_reserva, { puntaje: 4, etiquetas: ['PUNTUAL'] });

    const { datos } = await miReputacion(conductor);
    assert.equal(datos.reputacion.promedio, 4.5);
    assert.equal(datos.reputacion.cantidad, 2);
    assert.deepEqual(datos.reputacion.etiquetas[0], { codigo: 'PUNTUAL', cantidad: 2 });
    assert.ok(datos.reputacion.etiquetas.length <= 3);

    const pendiente = await reservar(propietario, conductor, estacionamiento, franja('08:00', '10:00', 4));
    const { datos: listado } = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}/reservas`, {
      token: propietario.token,
    });
    const porId = Object.fromEntries(listado.reservas.map((r) => [r.id_reserva, r]));

    assert.equal(porId[pendiente.id_reserva].conductor_promedio, 4.5);
    assert.equal(porId[pendiente.id_reserva].conductor_calificaciones, 2);
    assert.equal(porId[pendiente.id_reserva].conductor_calificable, false);
    assert.equal(porId[primera.id_reserva].calificacion_al_conductor, 5);
    assert.equal(porId[primera.id_reserva].conductor_calificable, false);
    assert.equal(porId[sinCalificar.id_reserva].calificacion_al_conductor, null);
    assert.equal(porId[sinCalificar.id_reserva].conductor_calificable, true);
  });

  test('el conductor no ve la nota que le puso cada estacionamiento', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);
    await calificarConductor(propietario, reserva.id_reserva, { puntaje: 2 });

    const { datos } = await api('GET', '/reservas', { token: conductor.token });
    const propia = datos.reservas.find((r) => r.id_reserva === reserva.id_reserva);
    for (const campo of ['calificacion_al_conductor', 'conductor_calificable', 'conductor_promedio', 'conductor_calificaciones']) {
      assert.ok(!(campo in propia), `no deberia venir ${campo}`);
    }
  });

  test('no cambia la reputacion del estacionamiento', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);
    await calificarConductor(propietario, reserva.id_reserva, { puntaje: 1 });

    const { datos } = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}`);
    assert.equal(datos.estacionamiento.calificaciones, 0);
    assert.equal(datos.estacionamiento.calificacion_promedio, null);
  });

  test('solo el conductor pide su reputacion', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    assert.equal((await miReputacion(propietario)).estado, 403);
  });
});
