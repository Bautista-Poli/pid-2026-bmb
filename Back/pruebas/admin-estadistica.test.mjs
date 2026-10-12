// Dashboard del administrador: lo que hay para revisar, los conflictos y la
// actividad de la plataforma. La base tiene datos de otras suites, asi que los
// totales se comparan por diferencia (antes y despues de crear los datos) y las
// listas se verifican buscando los ids propios.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearAdmin,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  query,
} from './ayuda.mjs';

before(() => levantarApi('admin-estadistica'));
after(() => cerrarApi());

/** YYYY-MM-DD de hace `dias` dias, en hora argentina. */
const diaLocal = (dias) => new Date(Date.now() - 3 * 3_600_000 - dias * 86_400_000).toISOString().slice(0, 10);
const PERIODO = { desde: diaLocal(29), hasta: diaLocal(0) };

let admin;
before(async () => {
  admin = await crearAdmin();
});

const stats = async (params = PERIODO, token = admin.token) => {
  const respuesta = await api('GET', `/admin/estadisticas?${new URLSearchParams(params)}`, { token });
  return { estado: respuesta.estado, e: respuesta.datos?.estadisticas };
};

/** Reserva confirmada de un conductor nuevo en un estacionamiento nuevo, y su reclamo abierto. */
async function conReclamo() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
  });
  await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, { token: propietario.token });
  const reclamo = await api('POST', '/incidencias/reclamos', {
    token: conductor.token,
    body: { id_reserva: datos.reserva.id_reserva, motivo: 'OTRO', texto: 'Algo salio mal con esta reserva, lo cuento aca.' },
  });
  return { propietario, estacionamiento, conductor, reserva: datos.reserva, incidencia: reclamo.datos.incidencia };
}

describe('acceso', () => {
  test('conductor y propietario no entran; un periodo invalido da 400', async () => {
    const conductor = await crearUsuario();
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });

    assert.equal((await stats(PERIODO, conductor.token)).estado, 403);
    assert.equal((await stats(PERIODO, propietario.token)).estado, 403);
    assert.equal((await stats({ desde: '2026-13-01', hasta: '2026-13-02' })).estado, 400);
  });
});

describe('para revisar', () => {
  test('un estacionamiento pendiente suma a la cola y, si es el mas antiguo, aparece primero', async () => {
    const antes = (await stats()).e.pendientes.enCola;
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    await query(`UPDATE estacionamiento SET enviado_en = '2000-01-01T12:00:00Z' WHERE id_estacionamiento = $1`, [
      estacionamiento.id_estacionamiento,
    ]);

    const { estado, e } = await stats();

    assert.equal(estado, 200);
    assert.equal(e.pendientes.enCola, antes + 1);
    assert.equal(e.pendientes.primeros[0].id, estacionamiento.id_estacionamiento);
    assert.equal(e.pendientes.primeros[0].propietario, 'Prueba Parkit');
    assert.equal(new Date(e.pendientes.masAntiguoDesde).toISOString(), '2000-01-01T12:00:00.000Z');
    assert.ok(e.pendientes.primeros.length <= 5);
  });

  test('un rechazado suma a rechazadosSinReenviar', async () => {
    const antes = (await stats()).e.pendientes.rechazadosSinReenviar;
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    await query(
      `UPDATE estacionamiento SET estado_aprobacion = 'RECHAZADO', motivo_rechazo = 'Faltan fotos de la entrada'
        WHERE id_estacionamiento = $1`,
      [estacionamiento.id_estacionamiento],
    );

    assert.equal((await stats()).e.pendientes.rechazadosSinReenviar, antes + 1);
  });

  test('un reclamo denunciado suma a denunciadas y uno abierto a reclamosEnConversacion', async () => {
    const antes = (await stats()).e.disputas;
    const abierto = await conReclamo();
    const denunciado = await conReclamo();
    await query(`UPDATE incidencia SET denunciada_at = '2000-01-02T12:00:00Z' WHERE id_incidencia = $1`, [
      denunciado.incidencia.id_incidencia,
    ]);
    await api('PATCH', `/incidencias/${denunciado.incidencia.id_incidencia}/denunciar`, {
      token: denunciado.conductor.token,
      body: { motivo: 'No nos ponemos de acuerdo.' },
    });
    // denunciar pisa denunciada_at: se vuelve a llevar al pasado para que sea la mas antigua.
    await query(`UPDATE incidencia SET denunciada_at = '2000-01-02T12:00:00Z' WHERE id_incidencia = $1`, [
      denunciado.incidencia.id_incidencia,
    ]);

    const { e } = await stats();

    assert.equal(e.disputas.denunciadas, antes.denunciadas + 1);
    assert.equal(e.disputas.reclamosEnConversacion, antes.reclamosEnConversacion + 1);
    assert.equal(e.disputas.primeras[0].id, denunciado.incidencia.id_incidencia);
    assert.equal(e.disputas.primeras[0].tipo, 'RECLAMO');
    assert.equal(e.disputas.primeras[0].motivo, 'OTRO');
    assert.equal(e.disputas.primeras[0].estacionamiento, denunciado.estacionamiento.nombre);
    assert.ok(abierto.incidencia.id_incidencia);
  });
});
