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

const DESCRIPCION = 'No habia lugar cuando llegue y tuve que irme a otro lado.';

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
    body: { motivo: 'NO_HABIA_LUGAR', texto: DESCRIPCION, ...body },
  });

describe('abrir un reclamo', () => {
  test('sobre su reserva', async () => {
    const { conductor, reserva } = await escenarioReserva();

    const { estado, datos } = await reclamar(conductor, { id_reserva: reserva.id_reserva, monto_pedido: 1500 });

    assert.equal(estado, 201);
    const incidencia = datos.incidencia;
    assert.equal(incidencia.tipo, 'RECLAMO');
    assert.equal(incidencia.estado, 'ABIERTA');
    assert.equal(incidencia.motivo, 'NO_HABIA_LUGAR');
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
