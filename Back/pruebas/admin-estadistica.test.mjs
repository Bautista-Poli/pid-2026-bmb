// Dashboard del administrador: lo que hay para revisar, los conflictos y la
// actividad de la plataforma. Las otras suites corren en paralelo contra la
// misma base: lo que es estado actual (colas) se verifica buscando los datos
// propios (forzados a ser los mas antiguos) y lo que depende del periodo se
// prueba en semanas de 2001, donde no escribe nadie mas.
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
const AYER = diaLocal(1);
const instante = (fecha, hora) => `${fecha}T${String(hora).padStart(2, '0')}:00:00-03:00`;

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

/**
 * Estacionamiento con un conductor; `reserva()` inserta por SQL una reserva de
 * 1 h (cada una en su hora, para que no se pisen) y devuelve su id.
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
  const reserva = async ({
    estado = 'FINALIZADA',
    canceladaPor = null,
    motivoReasignacion = null,
    precio = 1000,
    fecha = AYER,
  } = {}) => {
    const h = hora++;
    const { rows: creada } = await query(
      `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, precio_total, modalidad,
                            cancelada_por, motivo_reasignacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'HORA', $8, $9)
       RETURNING id_reserva`,
      [
        conductor.id, vehiculo.id_vehiculo, rows[0].id_cochera, instante(fecha, h), instante(fecha, h + 1), estado,
        precio, canceladaPor, motivoReasignacion,
      ],
    );
    return creada[0].id_reserva;
  };
  const incidencia = async (tipo, idReserva, extra = {}) =>
    (
      await query(
        `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento, abierta_por, motivo, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
         RETURNING id_incidencia`,
        [tipo, idReserva, estacionamiento.id_estacionamiento, extra.abiertaPor ?? null, extra.motivo ?? null,
          extra.creadaEn ?? null],
      )
    ).rows[0].id_incidencia;
  return { propietario, estacionamiento, conductor, reserva, incidencia };
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
  test('un estacionamiento pendiente entra en la cola y, si es el mas antiguo, aparece primero', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    await query(`UPDATE estacionamiento SET enviado_en = '2000-01-01T12:00:00Z' WHERE id_estacionamiento = $1`, [
      estacionamiento.id_estacionamiento,
    ]);

    const { estado, e } = await stats();

    assert.equal(estado, 200);
    assert.ok(e.pendientes.enCola >= 1);
    assert.equal(e.pendientes.primeros[0].id, estacionamiento.id_estacionamiento);
    assert.equal(e.pendientes.primeros[0].propietario, 'Prueba Parkit');
    assert.equal(new Date(e.pendientes.masAntiguoDesde).toISOString(), '2000-01-01T12:00:00.000Z');
    assert.ok(e.pendientes.primeros.length <= 5);
  });

  test('los rechazados se cuentan aparte', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    await query(
      `UPDATE estacionamiento SET estado_aprobacion = 'RECHAZADO', motivo_rechazo = 'Faltan fotos de la entrada'
        WHERE id_estacionamiento = $1`,
      [estacionamiento.id_estacionamiento],
    );

    const { e } = await stats();
    assert.ok(e.pendientes.rechazadosSinReenviar >= 1);
    assert.ok(!e.pendientes.primeros.some((p) => p.id === estacionamiento.id_estacionamiento));
  });

  test('un reclamo denunciado entra en las disputas y uno abierto en los que siguen en conversacion', async () => {
    const abierto = await conReclamo();
    const denunciado = await conReclamo();
    await api('PATCH', `/incidencias/${denunciado.incidencia.id_incidencia}/denunciar`, {
      token: denunciado.conductor.token,
      body: { motivo: 'No nos ponemos de acuerdo.' },
    });
    // Se lleva la denuncia al pasado para que sea la mas antigua de la cola.
    await query(`UPDATE incidencia SET denunciada_at = '2000-01-02T12:00:00Z' WHERE id_incidencia = $1`, [
      denunciado.incidencia.id_incidencia,
    ]);

    const { e } = await stats();

    assert.ok(e.disputas.denunciadas >= 1);
    assert.ok(e.disputas.reclamosEnConversacion >= 1);
    assert.deepEqual(e.disputas.primeras[0], {
      id: denunciado.incidencia.id_incidencia,
      tipo: 'RECLAMO',
      motivo: 'OTRO',
      estacionamiento: denunciado.estacionamiento.nombre,
      denunciadaEn: '2000-01-02T12:00:00.000Z',
    });
    assert.ok(!e.disputas.primeras.some((d) => d.id === abierto.incidencia.id_incidencia));
  });
});

/* ------------------------------ conflictos ------------------------------ */

// En una semana de 2001 no escribe nadie mas: la lista de problematicos es exacta.
const SEMANA_PROBLEMAS = { desde: '2001-07-01', hasta: '2001-07-07' };
const DIA_PROBLEMAS = '2001-07-03';
const problematicos = async () => (await stats(SEMANA_PROBLEMAS)).e.conflictos.problematicos;
const problematicoDe = async (x) =>
  (await problematicos()).find((p) => p.id === x.estacionamiento.id_estacionamiento);

describe('estacionamientos problematicos', () => {
  const fecha = DIA_PROBLEMAS;

  test('menos de 5 reservas no alcanza aunque cancele mucho', async () => {
    const x = await escenario();
    await x.reserva({ fecha });
    for (let i = 0; i < 3; i++) await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });

    assert.equal(await problematicoDe(x), undefined);
  });

  test('cancelaciones del propietario y del sistema por encima del 30 %', async () => {
    const x = await escenario();
    for (let i = 0; i < 3; i++) await x.reserva({ fecha });
    await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });
    await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'SISTEMA' });

    assert.deepEqual(await problematicoDe(x), {
      id: x.estacionamiento.id_estacionamiento,
      nombre: x.estacionamiento.nombre,
      propietario: 'Prueba Parkit',
      reservas: 5,
      tasaCancelacion: 0.4,
      reclamos: 0,
      razones: ['CANCELACIONES'],
    });
  });

  test('las que cancela el conductor no cuentan', async () => {
    const x = await escenario();
    for (let i = 0; i < 2; i++) await x.reserva({ fecha });
    for (let i = 0; i < 3; i++) await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'CONDUCTOR' });

    assert.equal(await problematicoDe(x), undefined);
  });

  test('dos reclamos abiertos o perdidos', async () => {
    const x = await escenario();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await x.reserva({ fecha }));
    const creadaEn = instante(fecha, 22);
    await x.incidencia('RECLAMO', ids[0], { abiertaPor: x.conductor.id, motivo: 'OTRO', creadaEn });
    await x.incidencia('RECLAMO', ids[1], { abiertaPor: x.conductor.id, motivo: 'OTRO', creadaEn });

    const p = await problematicoDe(x);
    assert.deepEqual(p.razones, ['RECLAMOS']);
    assert.equal(p.reclamos, 2);
  });

  test('un estacionamiento dado de baja no aparece', async () => {
    const x = await escenario();
    for (let i = 0; i < 5; i++) await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });
    await query('UPDATE estacionamiento SET activo = false WHERE id_estacionamiento = $1', [
      x.estacionamiento.id_estacionamiento,
    ]);

    assert.equal(await problematicoDe(x), undefined);
  });

  test('con dos razones va primero, y los empates por tasa', async () => {
    const lista = await problematicos();
    const clave = (p) => [p.razones.length, p.tasaCancelacion];
    for (let i = 1; i < lista.length; i++) {
      const [razonesA, tasaA] = clave(lista[i - 1]);
      const [razonesB, tasaB] = clave(lista[i]);
      assert.ok(razonesA > razonesB || (razonesA === razonesB && tasaA >= tasaB));
    }
  });
});

describe('bloqueos', () => {
  test('reasignadas, canceladas por bloqueo, autos excedidos y reservas sin cochera', async () => {
    const SEMANA = { desde: '2001-05-01', hasta: '2001-05-07' };
    const fecha = '2001-05-03';
    const creadaEn = instante(fecha, 23);
    const x = await escenario();
    const aviso = 'Te reasignamos a otra cochera.';
    await x.reserva({ fecha, motivoReasignacion: aviso });
    await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'PROPIETARIO', motivoReasignacion: aviso });
    // Reasignada y despues cancelada por el conductor: no es un bloqueo.
    await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'CONDUCTOR', motivoReasignacion: aviso });
    await x.incidencia('AUTO_EXCEDIDO', await x.reserva({ fecha }), { creadaEn });
    await x.incidencia('RESERVA_AFECTADA', await x.reserva({ fecha }), { creadaEn });

    const { bloqueos } = (await stats(SEMANA)).e.conflictos;
    assert.deepEqual(
      [bloqueos.reasignadas, bloqueos.canceladas, bloqueos.autosExcedidos, bloqueos.sinCochera],
      [1, 1, 1, 1],
    );
    assert.deepEqual(bloqueos.porEstacionamiento, [
      {
        id: x.estacionamiento.id_estacionamiento,
        nombre: x.estacionamiento.nombre,
        reasignadas: 1,
        canceladas: 1,
        autosExcedidos: 1,
        sinCochera: 1,
      },
    ]);
  });
});

/* ------------------------------ actividad ------------------------------- */

describe('actividad', () => {
  test('usuarios nuevos por perfil: con los dos perfiles suma a ambos y el admin no suma', async () => {
    const SEMANA = { desde: '2001-03-01', hasta: '2001-03-07' };
    const conductor = await crearUsuario();
    const ambos = await crearUsuario({ roles: ['CONDUCTOR', 'PROPIETARIO'] });
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const otroAdmin = await crearAdmin();
    await query(`UPDATE usuario SET created_at = '2001-03-02T15:00:00Z' WHERE id_usuario = ANY($1::uuid[])`, [
      [conductor.id, ambos.id, propietario.id, otroAdmin.id],
    ]);

    const { kpis } = (await stats(SEMANA)).e.actividad;
    assert.equal(kpis.conductoresNuevos.valor, 2);
    assert.equal(kpis.propietariosNuevos.valor, 2);
  });

  test('volumen neto de devoluciones, reservas, aprobados, reservas por dia y rankings', async () => {
    const SEMANA = { desde: '2001-04-01', hasta: '2001-04-07' };
    const fecha = '2001-04-03';
    const x = await escenario();
    const idReserva = await x.reserva({ fecha, precio: 3000 });
    await x.reserva({ fecha, estado: 'CANCELADA', canceladaPor: 'CONDUCTOR', precio: 999 });
    const idIncidencia = await x.incidencia('AUTO_EXCEDIDO', idReserva, { creadaEn: instante(fecha, 20) });
    await query(
      `INSERT INTO devolucion (id_incidencia, id_reserva, monto, aplicada_por, created_at)
       VALUES ($1, $2, 1000, 'ADMINISTRADOR', $3)`,
      [idIncidencia, idReserva, instante(fecha, 21)],
    );
    await query(`UPDATE estacionamiento SET revisado_en = '2001-04-04T15:00:00Z' WHERE id_estacionamiento = $1`, [
      x.estacionamiento.id_estacionamiento,
    ]);

    const { actividad } = (await stats(SEMANA)).e;
    const { kpis } = actividad;
    assert.equal(kpis.reservas.valor, 2);
    assert.equal(kpis.volumen.valor, 2000);
    assert.equal(kpis.devoluciones.valor, 1000);
    assert.equal(kpis.tasaCancelacion.valor, 0.5);
    assert.equal(kpis.estacionamientosAprobados.valor, 1);
    assert.equal(actividad.reservasPorDia.length, 7);
    assert.deepEqual(
      actividad.reservasPorDia.find((d) => d.fecha === fecha),
      { fecha, finalizadas: 1, enCurso: 0, confirmadas: 0, pendientes: 0, canceladas: 1, ausentes: 0 },
    );
    const propio = { id: x.estacionamiento.id_estacionamiento, nombre: x.estacionamiento.nombre };
    assert.deepEqual(actividad.topPorReservas, [{ ...propio, valor: 2 }]);
    assert.deepEqual(actividad.topPorIngresos, [{ ...propio, valor: 2000 }]);
  });

  test('un periodo sin datos da ceros, no NaN', async () => {
    const { estado, e } = await stats({ desde: '2099-01-01', hasta: '2099-01-07' });

    assert.equal(estado, 200);
    const { kpis, reservasPorDia, topPorReservas, topPorIngresos } = e.actividad;
    assert.equal(kpis.tasaCancelacion.valor, 0);
    assert.equal(kpis.reservas.valor, 0);
    assert.equal(kpis.volumen.valor, 0);
    assert.equal(reservasPorDia.length, 7);
    assert.ok(reservasPorDia.every((d) => d.finalizadas + d.canceladas + d.confirmadas === 0));
    assert.deepEqual(topPorReservas, []);
    assert.deepEqual(topPorIngresos, []);
    assert.deepEqual(e.conflictos.problematicos, []);
  });

  test('el periodo anterior es el de igual largo justo antes', async () => {
    const x = await escenario();
    await x.reserva({ fecha: '2001-06-05', precio: 500 });

    const { kpis } = (await stats({ desde: '2001-06-08', hasta: '2001-06-14' })).e.actividad;
    assert.equal(kpis.reservas.valor, 0);
    assert.equal(kpis.reservas.anterior, 1);
    assert.equal(kpis.volumen.anterior, 500);
  });
});

test('bloqueos empatados se ordenan por nombre', async () => {
  const SEMANA = { desde: '2001-08-01', hasta: '2001-08-07' };
  const fecha = '2001-08-03';
  const a = await escenario();
  const b = await escenario();
  await a.reserva({ fecha, motivoReasignacion: 'Reasignada' });
  await b.reserva({ fecha, motivoReasignacion: 'Reasignada' });

  const nombres = (await stats(SEMANA)).e.conflictos.bloqueos.porEstacionamiento.map((x) => x.nombre);
  assert.deepEqual(nombres, [a.estacionamiento.nombre, b.estacionamiento.nombre].sort((x, y) => x.localeCompare(y)));
});
