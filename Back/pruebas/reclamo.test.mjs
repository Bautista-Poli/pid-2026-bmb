// Reclamos del conductor (incidencias de tipo RECLAMO) sobre una reserva o un
// abono: abrirlos, la propuesta de devolucion del propietario, aceptarla o
// retirarlos, y las devoluciones que quedan registradas.
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

before(() => levantarApi('reclamo'));
after(() => cerrarApi());

const DESCRIPCION = 'No habia cochera libre cuando llegue y tuve que irme a otro lado.';

/** Reserva confirmada de 4 h a $1000 la hora: se pagaron $4000. */
async function escenarioReserva() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...franja('08:00', '12:00'),
    },
  });
  const reserva = datos.reserva;
  await api('PATCH', `/reservas/${reserva.id_reserva}/confirmar`, { token: propietario.token });
  return { propietario, estacionamiento, conductor, vehiculo, reserva };
}

/** Abono de $30000 comprado por un conductor. */
async function escenarioAbono() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  const { datos: conPlan } = await api(
    'POST',
    `/estacionamientos/${estacionamiento.id_estacionamiento}/planes-abono`,
    { token: propietario.token, body: { turno: 'MANANA', cupos: 2, precio: 30000 } },
  );
  const conductor = await crearUsuario();
  const { datos } = await api('POST', '/abonos', {
    token: conductor.token,
    body: { id_plan: conPlan.plan.id_plan },
  });
  return { propietario, estacionamiento, conductor, abono: datos.abono };
}

const reclamar = (conductor, body) =>
  api('POST', '/incidencias/reclamos', {
    token: conductor.token,
    body: { motivo: 'NO_HABIA_COCHERA', texto: DESCRIPCION, ...body },
  });

describe('abrir un reclamo', () => {
  test('sobre su reserva', async () => {
    const { conductor, reserva } = await escenarioReserva();

    const { estado, datos } = await reclamar(conductor, { id_reserva: reserva.id_reserva, monto_pedido: 1500 });

    assert.equal(estado, 201);
    const incidencia = datos.incidencia;
    assert.equal(incidencia.tipo, 'RECLAMO');
    assert.equal(incidencia.estado, 'ABIERTA');
    assert.equal(incidencia.motivo, 'NO_HABIA_COCHERA');
    assert.equal(incidencia.monto_pedido, 1500);
    assert.equal(incidencia.pagado, 4000);
    assert.equal(incidencia.devuelto, 0);
    assert.equal(incidencia.tope, 4000);
    assert.equal(typeof incidencia.tope, 'number');
    assert.equal(incidencia.propuesta_vigente, null);
    assert.equal(incidencia.mensajes.length, 1);
    assert.equal(incidencia.mensajes[0].rol_autor, 'CONDUCTOR');
    assert.equal(incidencia.mensajes[0].canal, 'GENERAL');
    assert.equal(incidencia.mensajes[0].texto, DESCRIPCION);
  });

  test('sobre un abono', async () => {
    const { conductor, abono } = await escenarioAbono();

    const { estado, datos } = await reclamar(conductor, { id_abono: abono.id_abono, motivo: 'MAL_SERVICIO' });

    assert.equal(estado, 201);
    assert.equal(datos.incidencia.id_abono, abono.id_abono);
    assert.equal(datos.incidencia.id_reserva, null);
    assert.equal(datos.incidencia.tope, 30000);
  });

  test('una reserva ajena da 404', async () => {
    const { reserva } = await escenarioReserva();
    const otro = await crearUsuario();

    assert.equal((await reclamar(otro, { id_reserva: reserva.id_reserva })).estado, 404);
  });

  test('pasados 15 dias del fin ya no se puede', async () => {
    const { conductor, reserva } = await escenarioReserva();
    await query(
      `UPDATE reserva SET estado = 'FINALIZADA',
              inicio = now() - interval '16 days 4 hours', fin = now() - interval '16 days'
        WHERE id_reserva = $1`,
      [reserva.id_reserva],
    );

    const respuesta = await reclamar(conductor, { id_reserva: reserva.id_reserva });

    assert.equal(respuesta.estado, 409);
    assert.equal(motivo(respuesta), 'Pasaron más de 15 días; ya no se puede reclamar');
  });

  test('una reserva de abono se reclama sobre el abono', async () => {
    const { conductor, reserva } = await escenarioReserva();
    const { abono } = await escenarioAbono();
    // Se asocia por SQL: alcanza con que la reserva tenga id_abono.
    await query('UPDATE abono SET id_conductor = $1 WHERE id_abono = $2', [conductor.id, abono.id_abono]);
    await query('UPDATE reserva SET id_abono = $1 WHERE id_reserva = $2', [abono.id_abono, reserva.id_reserva]);

    const respuesta = await reclamar(conductor, { id_reserva: reserva.id_reserva });

    assert.equal(respuesta.estado, 409);
    assert.equal(motivo(respuesta), 'Esta reserva es parte de un abono; hacé el reclamo sobre el abono');
  });

  test('uno solo abierto a la vez', async () => {
    const { conductor, reserva } = await escenarioReserva();
    await reclamar(conductor, { id_reserva: reserva.id_reserva });

    const segundo = await reclamar(conductor, { id_reserva: reserva.id_reserva });

    assert.equal(segundo.estado, 409);
    assert.equal(motivo(segundo), 'Ya tenés un reclamo abierto sobre esto');
  });

  test('datos invalidos dan 400', async () => {
    const { conductor, reserva } = await escenarioReserva();
    const { abono } = await escenarioAbono();

    assert.equal((await reclamar(conductor, { id_reserva: reserva.id_reserva, monto_pedido: 4001 })).estado, 400);
    assert.equal((await reclamar(conductor, { id_reserva: reserva.id_reserva, texto: 'Muy corto' })).estado, 400);
    assert.equal((await reclamar(conductor, { id_reserva: reserva.id_reserva, motivo: 'CUALQUIERA' })).estado, 400);
    assert.equal(
      (await reclamar(conductor, { id_reserva: reserva.id_reserva, id_abono: abono.id_abono })).estado,
      400,
    );
    assert.equal((await reclamar(conductor, {})).estado, 400);
  });

  test('un propietario no abre reclamos', async () => {
    const { propietario, reserva } = await escenarioReserva();

    assert.equal((await reclamar(propietario, { id_reserva: reserva.id_reserva })).estado, 403);
  });

  test('el propietario ve reclamos de reserva y de abono junto a las incidencias del sistema', async () => {
    const { propietario, estacionamiento, conductor, reserva } = await escenarioReserva();
    await reclamar(conductor, { id_reserva: reserva.id_reserva });
    await query(
      `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento) VALUES ('AUTO_EXCEDIDO', $1, $2)`,
      [reserva.id_reserva, estacionamiento.id_estacionamiento],
    );
    // Abono en el mismo estacionamiento.
    const { datos: conPlan } = await api(
      'POST',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/planes-abono`,
      { token: propietario.token, body: { turno: 'NOCHE', cupos: 2, precio: 20000 } },
    );
    const { datos: compra } = await api('POST', '/abonos', {
      token: conductor.token,
      body: { id_plan: conPlan.plan.id_plan },
    });
    await reclamar(conductor, { id_abono: compra.abono.id_abono });

    const { estado, datos } = await api('GET', '/incidencias', { token: propietario.token });

    assert.equal(estado, 200);
    assert.deepEqual(datos.incidencias.map((i) => i.tipo).sort(), ['AUTO_EXCEDIDO', 'RECLAMO', 'RECLAMO']);
    const deAbono = datos.incidencias.find((i) => i.id_abono);
    assert.equal(deAbono.patente, null);
    assert.equal(deAbono.tope, 20000);

    const delConductor = await api('GET', '/incidencias', { token: conductor.token });
    assert.equal(delConductor.datos.incidencias.length, 3);
  });
});

/* ---------------------- propuesta, aceptar, retirar ---------------------- */

async function reclamoAbierto() {
  const escenario = await escenarioReserva();
  const { datos } = await reclamar(escenario.conductor, { id_reserva: escenario.reserva.id_reserva });
  return { ...escenario, incidencia: datos.incidencia };
}

const proponer = (propietario, incidencia, monto_propuesto, extra = {}) =>
  api('POST', `/incidencias/${incidencia.id_incidencia}/mensajes`, {
    token: propietario.token,
    body: { texto: 'Te ofrezco devolverte una parte.', monto_propuesto, ...extra },
  });

const aceptar = (conductor, incidencia, monto) =>
  api('PATCH', `/incidencias/${incidencia.id_incidencia}/aceptar`, { token: conductor.token, body: { monto } });

const retirar = (conductor, incidencia) =>
  api('PATCH', `/incidencias/${incidencia.id_incidencia}/retirar`, { token: conductor.token });

const denunciar = (usuario, incidencia) =>
  api('PATCH', `/incidencias/${incidencia.id_incidencia}/denunciar`, {
    token: usuario.token,
    body: { motivo: 'No nos ponemos de acuerdo.' },
  });

const devolucionesDe = async (idIncidencia) =>
  (
    await query(
      `SELECT monto::float AS monto, aplicada_por::text AS aplicada_por FROM devolucion WHERE id_incidencia = $1`,
      [idIncidencia],
    )
  ).rows;

describe('propuesta de devolucion', () => {
  test('el propietario propone y vale la ultima', async () => {
    const { propietario, incidencia } = await reclamoAbierto();

    await proponer(propietario, incidencia, 1000);
    const { estado, datos } = await proponer(propietario, incidencia, 1500);

    assert.equal(estado, 201);
    assert.equal(datos.incidencia.propuesta_vigente, 1500);
    assert.equal(datos.incidencia.mensajes.at(-1).monto_propuesto, 1500);
  });

  test('no puede pasar el tope', async () => {
    const { propietario, incidencia } = await reclamoAbierto();

    assert.equal((await proponer(propietario, incidencia, 4001)).estado, 400);
  });

  test('solo el propietario, en el canal general y en un reclamo abierto', async () => {
    const { propietario, conductor, incidencia, reserva, estacionamiento } = await reclamoAbierto();

    assert.equal((await proponer(conductor, incidencia, 100)).estado, 400);
    assert.equal((await proponer(propietario, incidencia, 100, { canal: 'PROPIETARIO' })).estado, 400);

    const { rows } = await query(
      `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento) VALUES ('AUTO_EXCEDIDO', $1, $2)
       RETURNING id_incidencia`,
      [reserva.id_reserva, estacionamiento.id_estacionamiento],
    );
    assert.equal((await proponer(propietario, rows[0], 100)).estado, 409);
  });
});

describe('aceptar y retirar', () => {
  test('aceptar aplica la devolucion y cierra el reclamo', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 2000);

    const { estado, datos } = await aceptar(conductor, incidencia, 2000);

    assert.equal(estado, 200);
    assert.equal(datos.incidencia.estado, 'RESUELTA');
    assert.equal(datos.incidencia.devuelto, 2000);
    assert.equal(datos.incidencia.tope, 2000);
    assert.deepEqual(await devolucionesDe(incidencia.id_incidencia), [{ monto: 2000, aplicada_por: 'PROPIETARIO' }]);
  });

  test('aceptar $0 cierra sin devolucion', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 0);

    const { datos } = await aceptar(conductor, incidencia, 0);

    assert.equal(datos.incidencia.estado, 'RESUELTA');
    assert.deepEqual(await devolucionesDe(incidencia.id_incidencia), []);
  });

  test('sin propuesta, con otra propuesta o dos veces da 409', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();

    assert.equal((await aceptar(conductor, incidencia, 0)).estado, 409);

    await proponer(propietario, incidencia, 1000);
    await proponer(propietario, incidencia, 500);
    const vieja = await aceptar(conductor, incidencia, 1000);
    assert.equal(vieja.estado, 409);
    assert.equal(motivo(vieja), 'El propietario cambió la propuesta');

    assert.equal((await aceptar(conductor, incidencia, 500)).estado, 200);
    assert.equal((await aceptar(conductor, incidencia, 500)).estado, 409);
    assert.equal((await devolucionesDe(incidencia.id_incidencia)).length, 1);
  });

  test('retirar lo deja de solo lectura', async () => {
    const { conductor, incidencia } = await reclamoAbierto();

    const { estado, datos } = await retirar(conductor, incidencia);
    assert.equal(estado, 200);
    assert.equal(datos.incidencia.estado, 'RETIRADA');

    const mensaje = await api('POST', `/incidencias/${incidencia.id_incidencia}/mensajes`, {
      token: conductor.token,
      body: { texto: 'Hola?' },
    });
    assert.equal(mensaje.estado, 409);
    assert.equal((await denunciar(conductor, incidencia)).estado, 409);
  });

  test('denunciado ya no se acepta ni se retira', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 1000);
    await denunciar(propietario, incidencia);

    assert.equal((await aceptar(conductor, incidencia, 1000)).estado, 409);
    assert.equal((await retirar(conductor, incidencia)).estado, 409);
  });

  test('el propietario no puede marcar resuelto un reclamo', async () => {
    const { propietario, incidencia } = await reclamoAbierto();

    const respuesta = await api('PATCH', `/incidencias/${incidencia.id_incidencia}/resolver`, {
      token: propietario.token,
      body: {},
    });

    assert.equal(respuesta.estado, 409);
    assert.equal(motivo(respuesta), 'Un reclamo lo cierra el conductor aceptando tu propuesta, o la moderación');
  });

  test('dos reclamos sucesivos no superan lo pagado', async () => {
    const { propietario, conductor, reserva, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 3900);
    await aceptar(conductor, incidencia, 3900);

    const { datos } = await reclamar(conductor, { id_reserva: reserva.id_reserva });
    assert.equal(datos.incidencia.tope, 100);
    assert.equal((await proponer(propietario, datos.incidencia, 200)).estado, 400);
    assert.equal((await proponer(propietario, datos.incidencia, 100)).estado, 201);
  });
});

describe('la reserva y el abono muestran el reclamo y lo devuelto', () => {
  test('reserva: reclamo abierto y, al aceptar, lo devuelto', async () => {
    const { propietario, conductor, reserva, incidencia } = await reclamoAbierto();
    const mia = async () =>
      (await api('GET', '/reservas', { token: conductor.token })).datos.reservas.find(
        (r) => r.id_reserva === reserva.id_reserva,
      );

    assert.equal((await mia()).reclamo_abierto, incidencia.id_incidencia);
    assert.equal((await mia()).devuelto, 0);

    await proponer(propietario, incidencia, 2000);
    await aceptar(conductor, incidencia, 2000);

    assert.equal((await mia()).reclamo_abierto, null);
    assert.equal((await mia()).devuelto, 2000);
  });

  test('abono: igual', async () => {
    const { propietario, conductor, abono } = await escenarioAbono();
    const { datos } = await reclamar(conductor, { id_abono: abono.id_abono });
    const mio = async () =>
      (await api('GET', '/abonos', { token: conductor.token })).datos.abonos.find((a) => a.id_abono === abono.id_abono);

    assert.equal((await mio()).reclamo_abierto, datos.incidencia.id_incidencia);

    await proponer(propietario, datos.incidencia, 5000);
    await aceptar(conductor, datos.incidencia, 5000);

    assert.equal((await mio()).reclamo_abierto, null);
    assert.equal((await mio()).devuelto, 5000);
  });
});

describe('reservas canceladas', () => {
  test('no se cobraron: se pueden reclamar pero no hay nada para devolver', async () => {
    const { propietario, conductor, reserva } = await escenarioReserva();
    await query(`UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'PROPIETARIO' WHERE id_reserva = $1`, [
      reserva.id_reserva,
    ]);

    const { estado, datos } = await reclamar(conductor, { id_reserva: reserva.id_reserva });
    assert.equal(estado, 201);
    assert.equal(datos.incidencia.pagado, 0);
    assert.equal(datos.incidencia.tope, 0);
    assert.equal((await proponer(propietario, datos.incidencia, 100)).estado, 400);
    assert.equal((await proponer(propietario, datos.incidencia, 0)).estado, 201);
  });
});

describe('montos y concurrencia', () => {
  test('los montos tienen hasta 2 decimales', async () => {
    const { propietario, conductor, reserva, incidencia } = await reclamoAbierto();

    const propuesta = await proponer(propietario, incidencia, 10.555);
    assert.equal(propuesta.estado, 400);
    assert.match(JSON.stringify(propuesta.datos), /2 decimales/);
    assert.equal((await reclamar(conductor, { id_reserva: reserva.id_reserva, monto_pedido: 0.001 })).estado, 400);
    assert.equal((await aceptar(conductor, incidencia, 1.234)).estado, 400);
    assert.equal((await proponer(propietario, incidencia, 10.5)).estado, 201);
  });

  test('dos aceptaciones a la vez: una sola devolucion', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 1000);

    const respuestas = await Promise.all([aceptar(conductor, incidencia, 1000), aceptar(conductor, incidencia, 1000)]);

    assert.deepEqual(respuestas.map((r) => r.estado).sort(), [200, 409]);
    assert.equal((await devolucionesDe(incidencia.id_incidencia)).length, 1);
  });

  test('aceptar y denunciar a la vez: gana uno solo', async () => {
    const { propietario, conductor, incidencia } = await reclamoAbierto();
    await proponer(propietario, incidencia, 1000);

    const [aceptada, denunciada] = await Promise.all([aceptar(conductor, incidencia, 1000), denunciar(propietario, incidencia)]);

    assert.deepEqual([aceptada.estado, denunciada.estado].sort(), [200, 409]);
    const { rows } = await query('SELECT estado::text AS estado FROM incidencia WHERE id_incidencia = $1', [
      incidencia.id_incidencia,
    ]);
    assert.equal(rows[0].estado, aceptada.estado === 200 ? 'RESUELTA' : 'DENUNCIADA');
  });

  test('el autor de un reclamo no se puede borrar mientras exista el reclamo', async () => {
    const { rows } = await query(
      `SELECT confdeltype FROM pg_constraint WHERE conname = 'incidencia_abierta_por_fk'`,
    );
    assert.equal(rows[0].confdeltype, 'r');
  });
});
