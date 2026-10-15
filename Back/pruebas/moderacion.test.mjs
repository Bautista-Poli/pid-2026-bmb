// Moderacion del administrador: la cola de incidencias denunciadas, sus chats
// privados con cada parte y la resolucion (con devolucion si corresponde).
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

before(() => levantarApi('moderacion'));
after(() => cerrarApi());

const FUNDAMENTO = 'El conductor demostro que no habia cochera libre al llegar.';

/** Reclamo de $4000 pagados, ya denunciado por el conductor. */
async function disputa({ denunciar = true } = {}) {
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
  const { datos: conReclamo } = await api('POST', '/incidencias/reclamos', {
    token: conductor.token,
    body: {
      id_reserva: reserva.id_reserva,
      motivo: 'NO_HABIA_COCHERA',
      texto: 'Llegue a horario y no habia ninguna cochera libre.',
    },
  });
  const incidencia = conReclamo.incidencia;
  if (denunciar) await denunciarComo(conductor, incidencia);
  return { propietario, estacionamiento, conductor, reserva, incidencia };
}

const denunciarComo = (usuario, incidencia) =>
  api('PATCH', `/incidencias/${incidencia.id_incidencia}/denunciar`, {
    token: usuario.token,
    body: { motivo: 'No nos ponemos de acuerdo.' },
  });

const escribir = (admin, incidencia, body) =>
  api('POST', `/admin/incidencias/${incidencia.id_incidencia}/mensajes`, { token: admin.token, body });

const resolver = (admin, incidencia, body) =>
  api('PATCH', `/admin/incidencias/${incidencia.id_incidencia}/resolver`, {
    token: admin.token,
    body: { fundamento: FUNDAMENTO, ...body },
  });

const devolucionesDe = async (idIncidencia) =>
  (
    await query(
      `SELECT monto::float AS monto, aplicada_por::text AS aplicada_por FROM devolucion WHERE id_incidencia = $1`,
      [idIncidencia],
    )
  ).rows;

let admin;
before(async () => {
  admin = await crearAdmin();
});

describe('cola de disputas', () => {
  test('trae solo las denunciadas, la mas vieja primero', async () => {
    const primera = await disputa();
    const segunda = await disputa();
    const abierta = await disputa({ denunciar: false });
    await query(`UPDATE incidencia SET denunciada_at = now() - interval '1 day' WHERE id_incidencia = $1`, [
      segunda.incidencia.id_incidencia,
    ]);

    const { estado, datos } = await api('GET', '/admin/incidencias', { token: admin.token });

    assert.equal(estado, 200);
    const ids = datos.incidencias.map((i) => i.id_incidencia);
    assert.ok(!ids.includes(abierta.incidencia.id_incidencia));
    assert.ok(ids.indexOf(segunda.incidencia.id_incidencia) < ids.indexOf(primera.incidencia.id_incidencia));
    assert.ok(datos.incidencias.every((i) => i.estado === 'DENUNCIADA'));
  });

  test('conductor y propietario no entran', async () => {
    const { conductor, propietario } = await disputa();

    assert.equal((await api('GET', '/admin/incidencias', { token: conductor.token })).estado, 403);
    assert.equal((await api('GET', '/admin/incidencias', { token: propietario.token })).estado, 403);
  });
});

describe('detalle y mensajes', () => {
  test('el detalle trae los tres chats y el resumen con el tope', async () => {
    const { incidencia } = await disputa();

    const { estado, datos } = await api('GET', `/admin/incidencias/${incidencia.id_incidencia}`, {
      token: admin.token,
    });

    assert.equal(estado, 200);
    const detalle = datos.incidencia;
    assert.deepEqual(new Set(detalle.mensajes.map((m) => m.canal)), new Set(['GENERAL', 'CONDUCTOR', 'PROPIETARIO']));
    assert.equal(detalle.pagado, 4000);
    assert.equal(detalle.tope, 4000);
    assert.equal(detalle.resumen.estado_reserva, 'CONFIRMADA');
    assert.ok(detalle.resumen.inicio);
  });

  test('el admin escribe en un chat privado y solo esa parte lo ve', async () => {
    const { conductor, propietario, incidencia } = await disputa();

    const { estado } = await escribir(admin, incidencia, { texto: 'Mandame una foto del estacionamiento.', canal: 'CONDUCTOR' });
    assert.equal(estado, 201);

    const ve = async (usuario) =>
      (await api('GET', `/incidencias/${incidencia.id_incidencia}`, { token: usuario.token })).datos.incidencia.mensajes
        .some((m) => m.rol_autor === 'ADMINISTRADOR');
    assert.equal(await ve(conductor), true);
    assert.equal(await ve(propietario), false);
  });

  test('no escribe en el general ni antes de la denuncia', async () => {
    const denunciada = await disputa();
    const abierta = await disputa({ denunciar: false });

    assert.equal((await escribir(admin, denunciada.incidencia, { texto: 'Hola', canal: 'GENERAL' })).estado, 400);
    assert.equal((await escribir(admin, abierta.incidencia, { texto: 'Hola', canal: 'CONDUCTOR' })).estado, 409);
  });
});

describe('resolver', () => {
  test('a favor del conductor aplica la devolucion', async () => {
    const { conductor, incidencia } = await disputa();

    const { estado, datos } = await resolver(admin, incidencia, { resolucion: 'A_FAVOR_CONDUCTOR', monto: 1500 });

    assert.equal(estado, 200);
    assert.equal(datos.incidencia.estado, 'RESUELTA');
    assert.equal(datos.incidencia.resolucion, 'A_FAVOR_CONDUCTOR');
    assert.deepEqual(await devolucionesDe(incidencia.id_incidencia), [{ monto: 1500, aplicada_por: 'ADMINISTRADOR' }]);
    const { rows } = await query('SELECT resuelta_por FROM incidencia WHERE id_incidencia = $1', [
      incidencia.id_incidencia,
    ]);
    assert.equal(rows[0].resuelta_por, admin.id);

    // El fundamento lo leen las dos partes, en el chat general.
    const vista = await api('GET', `/incidencias/${incidencia.id_incidencia}`, { token: conductor.token });
    const ultimo = vista.datos.incidencia.mensajes.filter((m) => m.canal === 'GENERAL').at(-1);
    assert.equal(ultimo.rol_autor, 'ADMINISTRADOR');
    assert.equal(ultimo.texto, FUNDAMENTO);
    assert.equal(vista.datos.incidencia.devuelto, 1500);
  });

  test('a favor del propietario no devuelve nada', async () => {
    const { incidencia } = await disputa();

    const { datos } = await resolver(admin, incidencia, { resolucion: 'A_FAVOR_PROPIETARIO' });

    assert.equal(datos.incidencia.resolucion, 'A_FAVOR_PROPIETARIO');
    assert.deepEqual(await devolucionesDe(incidencia.id_incidencia), []);
  });

  test('datos invalidos o una abierta', async () => {
    const { incidencia } = await disputa();
    const abierta = await disputa({ denunciar: false });

    assert.equal((await resolver(admin, incidencia, { resolucion: 'A_FAVOR_CONDUCTOR' })).estado, 400);
    assert.equal((await resolver(admin, incidencia, { resolucion: 'A_FAVOR_CONDUCTOR', monto: 4001 })).estado, 400);
    assert.equal((await resolver(admin, incidencia, { resolucion: 'A_FAVOR_PROPIETARIO', fundamento: 'Corto' })).estado, 400);
    assert.equal((await resolver(admin, abierta.incidencia, { resolucion: 'A_FAVOR_PROPIETARIO' })).estado, 409);
  });

  test('tambien cierra una incidencia del sistema denunciada', async () => {
    const { propietario, estacionamiento, reserva } = await disputa({ denunciar: false });
    const { rows } = await query(
      `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento) VALUES ('AUTO_EXCEDIDO', $1, $2)
       RETURNING id_incidencia`,
      [reserva.id_reserva, estacionamiento.id_estacionamiento],
    );
    await denunciarComo(propietario, rows[0]);

    const { estado, datos } = await resolver(admin, rows[0], { resolucion: 'A_FAVOR_CONDUCTOR', monto: 500 });

    assert.equal(estado, 200);
    assert.equal(datos.incidencia.estado, 'RESUELTA');
  });
});

test('el monto de la resolucion tiene hasta 2 decimales', async () => {
  const { incidencia } = await disputa();

  const respuesta = await resolver(admin, incidencia, { resolucion: 'A_FAVOR_CONDUCTOR', monto: 0.001 });

  assert.equal(respuesta.estado, 400);
  assert.match(JSON.stringify(respuesta.datos), /2 decimales/);
});

test('resolver y registrar el egreso a la vez no se traban', async () => {
  const { propietario, reserva, estacionamiento } = await disputa({ denunciar: false });
  // El auto esta adentro y se excedio: hay una AUTO_EXCEDIDO denunciada.
  await query(
    `UPDATE reserva SET estado = 'ACTIVA', inicio = now() - interval '3 hours', fin = now() - interval '1 hour',
            ingreso_real = now() - interval '3 hours' WHERE id_reserva = $1`,
    [reserva.id_reserva],
  );
  const { rows } = await query(
    `INSERT INTO incidencia (tipo, id_reserva, id_estacionamiento) VALUES ('AUTO_EXCEDIDO', $1, $2)
     RETURNING id_incidencia`,
    [reserva.id_reserva, estacionamiento.id_estacionamiento],
  );
  await denunciarComo(propietario, rows[0]);

  const [resuelta, egreso] = await Promise.all([
    resolver(admin, rows[0], { resolucion: 'A_FAVOR_PROPIETARIO' }),
    api('PATCH', `/reservas/${reserva.id_reserva}/egreso`, { token: propietario.token }),
  ]);

  assert.equal(resuelta.estado, 200);
  assert.equal(egreso.estado, 200);
});
