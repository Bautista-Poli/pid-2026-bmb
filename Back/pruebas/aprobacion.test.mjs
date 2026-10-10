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

describe('el propietario y la revision', () => {
  const estadoDe = async (id) => {
    const { rows } = await query(
      'SELECT estado_aprobacion, motivo_rechazo, enviado_en FROM estacionamiento WHERE id_estacionamiento = $1',
      [id],
    );
    return rows[0];
  };
  const rechazarDirecto = (id) =>
    query(
      `UPDATE estacionamiento SET estado_aprobacion = 'RECHAZADO', motivo_rechazo = 'Faltan fotos del frente'
        WHERE id_estacionamiento = $1`,
      [id],
    );

  test('cambiar el nombre de un aprobado lo vuelve a PENDIENTE y sus reservas siguen', async () => {
    const propietario = await nuevoPropietario();
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const id = estacionamiento.id_estacionamiento;

    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_estacionamiento: id, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
    });
    const idReserva = datos.reserva.id_reserva;
    await api('PATCH', `/reservas/${idReserva}/confirmar`, { token: propietario.token });
    const antes = await estadoDe(id);

    const cambio = await api('PATCH', `/estacionamientos/${id}`, {
      token: propietario.token,
      body: { nombre: 'Otro nombre de prueba' },
    });
    assert.equal(cambio.estado, 200);

    const despues = await estadoDe(id);
    assert.equal(despues.estado_aprobacion, 'PENDIENTE');
    assert.ok(despues.enviado_en > antes.enviado_en);

    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [idReserva]);
    assert.equal(rows[0].estado, 'CONFIRMADA');
  });

  test('mandar la misma direccion y cambiar la tarifa no lo saca de APROBADO', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const cambio = await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: {
        nombre: estacionamiento.nombre,
        calle: 'Av. Prueba',
        numero: '100',
        ciudad: 'CABA',
        provincia: 'Buenos Aires',
        tarifa_hora: 2000,
      },
    });
    assert.equal(cambio.estado, 200);
    assert.equal((await estadoDe(estacionamiento.id_estacionamiento)).estado_aprobacion, 'APROBADO');
  });

  test('reenviar desde RECHAZADO lo pasa a PENDIENTE en el momento y limpia el motivo', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const id = estacionamiento.id_estacionamiento;
    await rechazarDirecto(id);

    const reenvio = await api('PATCH', `/estacionamientos/${id}/reenviar-revision`, {
      token: propietario.token,
    });
    assert.equal(reenvio.estado, 200);
    assert.equal(reenvio.datos.estacionamiento.estado_aprobacion, 'PENDIENTE');
    assert.equal(reenvio.datos.estacionamiento.motivo_rechazo, null);
  });

  test('reenviar desde PENDIENTE o APROBADO da 409', async () => {
    const propietario = await nuevoPropietario();
    const pendiente = await crearEstacionamiento(propietario.token, { aprobado: false });
    const aprobado = await crearEstacionamiento(propietario.token);

    for (const { id_estacionamiento } of [pendiente, aprobado]) {
      const reenvio = await api('PATCH', `/estacionamientos/${id_estacionamiento}/reenviar-revision`, {
        token: propietario.token,
      });
      assert.equal(reenvio.estado, 409);
    }
  });

  test('reenviar uno ajeno da 403', async () => {
    const propietario = await nuevoPropietario();
    const ajeno = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    await rechazarDirecto(estacionamiento.id_estacionamiento);

    const reenvio = await api(
      'PATCH',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reenviar-revision`,
      { token: ajeno.token },
    );
    assert.equal(reenvio.estado, 403);
  });

  test('editar un RECHAZADO no lo reenvia solo', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
    const id = estacionamiento.id_estacionamiento;
    await rechazarDirecto(id);

    await api('PATCH', `/estacionamientos/${id}`, {
      token: propietario.token,
      body: { nombre: 'Nombre corregido', descripcion: 'Agregue fotos' },
    });
    assert.equal((await estadoDe(id)).estado_aprobacion, 'RECHAZADO');
  });
});
