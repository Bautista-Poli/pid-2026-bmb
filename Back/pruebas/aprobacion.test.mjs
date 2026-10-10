// Aprobacion de estacionamientos: estado en la base, visibilidad para el
// publico y los conductores, y las acciones del propietario sobre su estado.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  aprobarDirecto,
  crearAdmin,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';

before(() => levantarApi('aprobacion'));
after(() => cerrarApi());

const nuevoPropietario = () => crearUsuario({ rol: 'PROPIETARIO' });

describe('estado de aprobacion en la base', () => {
  test('un estacionamiento nuevo nace PENDIENTE con fechas cargadas', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });

    const { rows } = await query(
      `SELECT estado_aprobacion, enviado_en, created_at
         FROM estacionamiento WHERE id_estacionamiento = $1`,
      [estacionamiento.id_estacionamiento],
    );
    assert.equal(rows[0].estado_aprobacion, 'PENDIENTE');
    assert.ok(rows[0].enviado_en);
    assert.ok(rows[0].created_at);
  });

  test('crearAdmin deja una sesion con rol ADMINISTRADOR y solo ese perfil', async () => {
    const admin = await crearAdmin();
    const yo = await api('GET', '/auth/me', { token: admin.token });

    assert.equal(yo.estado, 200);
    assert.equal(yo.datos.usuario.rol, 'ADMINISTRADOR');
    assert.deepEqual(yo.datos.usuario.roles, ['ADMINISTRADOR']);
  });

  test('volver a migrar no aprueba a los pendientes', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });

    // Las mismas sentencias de relleno que corre schema.sql en cada migracion.
    await query(`UPDATE estacionamiento SET estado_aprobacion = 'APROBADO' WHERE estado_aprobacion IS NULL`);

    const { rows } = await query(
      'SELECT estado_aprobacion FROM estacionamiento WHERE id_estacionamiento = $1',
      [estacionamiento.id_estacionamiento],
    );
    assert.equal(rows[0].estado_aprobacion, 'PENDIENTE');
  });

  test('RECHAZADO sin motivo viola el CHECK', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });

    await assert.rejects(
      query(
        `UPDATE estacionamiento SET estado_aprobacion = 'RECHAZADO', motivo_rechazo = NULL
          WHERE id_estacionamiento = $1`,
        [estacionamiento.id_estacionamiento],
      ),
      /estacionamiento_rechazo_con_motivo/,
    );
  });
});

describe('visibilidad segun la aprobacion', () => {
  test('un PENDIENTE no aparece en la busqueda y al aprobarlo si', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const buscar = async () => {
      const respuesta = await api('GET', `/estacionamientos?q=${encodeURIComponent(estacionamiento.nombre)}`);
      return respuesta.datos.estacionamientos.map((e) => e.id_estacionamiento);
    };

    assert.ok(!(await buscar()).includes(estacionamiento.id_estacionamiento));
    await aprobarDirecto(estacionamiento.id_estacionamiento);
    assert.ok((await buscar()).includes(estacionamiento.id_estacionamiento));
  });

  test('el detalle de un PENDIENTE da 404 al publico y al conductor, y 200 al dueno', async () => {
    const propietario = await nuevoPropietario();
    const conductor = await crearUsuario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;

    assert.equal((await api('GET', ruta)).estado, 404);
    assert.equal((await api('GET', ruta, { token: conductor.token })).estado, 404);

    const delDueno = await api('GET', ruta, { token: propietario.token });
    assert.equal(delDueno.estado, 200);
    assert.equal(delDueno.datos.estacionamiento.estado_aprobacion, 'PENDIENTE');
  });

  test('el detalle publico de un APROBADO sigue andando sin sesion', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const detalle = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}`);
    assert.equal(detalle.estado, 200);
  });

  test('reservar en un PENDIENTE da 409, por asignacion y por cochera puntual', async () => {
    const propietario = await nuevoPropietario();
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const { rows } = await query('SELECT id_cochera FROM cochera WHERE id_estacionamiento = $1', [
      estacionamiento.id_estacionamiento,
    ]);

    const porAsignacion = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
    });
    assert.equal(porAsignacion.estado, 409);
    assert.match(motivo(porAsignacion), /no esta disponible para reservar/);

    const porCochera = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_cochera: rows[0].id_cochera, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
    });
    assert.equal(porCochera.estado, 409);
    assert.match(motivo(porCochera), /no esta disponible para reservar/);
  });

  test('la disponibilidad de un PENDIENTE da 409', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const fecha = franja().inicio.slice(0, 10);

    const respuesta = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/disponibilidad?fecha=${fecha}`,
    );
    assert.equal(respuesta.estado, 409);
  });
});
