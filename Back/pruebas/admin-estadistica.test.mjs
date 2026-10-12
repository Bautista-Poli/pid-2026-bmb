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

/* ------------------------------ conflictos ------------------------------ */

const AYER = diaLocal(1);
const instante = (fecha, hora) => `${fecha}T${String(hora).padStart(2, '0')}:00:00-03:00`;

/**
 * Estacionamiento con un conductor; `reserva()` inserta por SQL una reserva de
 * 1 h ayer (cada una en su hora, para que no se pisen) y devuelve su id.
 */
async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const { rows } = await query('SELECT id_cochera FROM cochera WHERE id_estacionamiento = $1', [
    estacionamiento.id_estacionamiento,
  ]);
  let hora = 0;
  const reserva = async ({ estado = 'FINALIZADA', canceladaPor = null, motivoReasignacion = null, precio = 1000, fecha = AYER } = {}) => {
    const h = hora++;
    const { rows: creada } = await query(
      `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, precio_total, modalidad,
                            cancelada_por, motivo_reasignacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'HORA', $8, $9)
       RETURNING id_reserva`,
      [conductor.id, vehiculo.id_vehiculo, rows[0].id_cochera, instante(fecha, h), instante(fecha, h + 1), estado, precio,
        canceladaPor, motivoReasignacion],
    );
    return creada[0].id_reserva;
  };
  const incidencia = (tipo, idReserva, extra = {}) =>
    query(
      `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento, abierta_por, motivo)
       VALUES ($1, $2, $3, $4, $5)`,
      [tipo, idReserva, estacionamiento.id_estacionamiento, extra.abiertaPor ?? null, extra.motivo ?? null],
    );
  return { propietario, estacionamiento, conductor, reserva, incidencia };
}

const problematicoDe = (e, escenarioActual) =>
  e.conflictos.problematicos.find((p) => p.id === escenarioActual.estacionamiento.id_estacionamiento);

describe('estacionamientos problematicos', () => {
  test('menos de 5 reservas no alcanza aunque cancele mucho', async () => {
    const x = await escenario();
    await x.reserva();
    for (let i = 0; i < 3; i++) await x.reserva({ estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });

    assert.equal(problematicoDe((await stats()).e, x), undefined);
  });

  test('cancelaciones del propietario y del sistema por encima del 30 %', async () => {
    const x = await escenario();
    for (let i = 0; i < 3; i++) await x.reserva();
    await x.reserva({ estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });
    await x.reserva({ estado: 'CANCELADA', canceladaPor: 'SISTEMA' });

    const p = problematicoDe((await stats()).e, x);
    assert.deepEqual(p.razones, ['CANCELACIONES']);
    assert.equal(p.tasaCancelacion, 0.4);
    assert.equal(p.reservas, 5);
    assert.equal(p.propietario, 'Prueba Parkit');
  });

  test('las que cancela el conductor no cuentan', async () => {
    const x = await escenario();
    for (let i = 0; i < 2; i++) await x.reserva();
    for (let i = 0; i < 3; i++) await x.reserva({ estado: 'CANCELADA', canceladaPor: 'CONDUCTOR' });

    assert.equal(problematicoDe((await stats()).e, x), undefined);
  });

  test('dos reclamos abiertos o perdidos', async () => {
    const x = await escenario();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await x.reserva());
    await x.incidencia('RECLAMO', ids[0], { abiertaPor: x.conductor.id, motivo: 'OTRO' });
    await x.incidencia('RECLAMO', ids[1], { abiertaPor: x.conductor.id, motivo: 'OTRO' });

    const p = problematicoDe((await stats()).e, x);
    assert.deepEqual(p.razones, ['RECLAMOS']);
    assert.equal(p.reclamos, 2);
  });
});

describe('bloqueos', () => {
  test('reasignadas, canceladas por bloqueo, autos excedidos y reservas sin cochera', async () => {
    const antes = (await stats()).e.conflictos.bloqueos;
    const x = await escenario();
    const aviso = 'Te reasignamos a otra cochera.';
    await x.reserva({ motivoReasignacion: aviso });
    await x.reserva({ estado: 'CANCELADA', canceladaPor: 'PROPIETARIO', motivoReasignacion: aviso });
    // Reasignada y despues cancelada por el conductor: no es un bloqueo.
    await x.reserva({ estado: 'CANCELADA', canceladaPor: 'CONDUCTOR', motivoReasignacion: aviso });
    await x.incidencia('AUTO_EXCEDIDO', await x.reserva());
    await x.incidencia('RESERVA_AFECTADA', await x.reserva());

    const { bloqueos } = (await stats()).e.conflictos;
    assert.equal(bloqueos.reasignadas, antes.reasignadas + 1);
    assert.equal(bloqueos.canceladas, antes.canceladas + 1);
    assert.equal(bloqueos.autosExcedidos, antes.autosExcedidos + 1);
    assert.equal(bloqueos.sinCochera, antes.sinCochera + 1);
    assert.ok(bloqueos.porEstacionamiento.length <= 5);
    const total = (b) => b.reasignadas + b.canceladas + b.autosExcedidos + b.sinCochera;
    const totales = bloqueos.porEstacionamiento.map(total);
    assert.deepEqual(totales, [...totales].sort((a, b) => b - a));
    const propio = bloqueos.porEstacionamiento.find((b) => b.id === x.estacionamiento.id_estacionamiento);
    if (propio) assert.deepEqual([propio.reasignadas, propio.canceladas, propio.autosExcedidos, propio.sinCochera], [1, 1, 1, 1]);
  });
});
