// Administrador de plataforma: cola de revision, aprobar y rechazar, y los
// limites del perfil (no se registra ni se combina con otros).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearAdmin,
  crearEstacionamiento,
  crearUsuario,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';

before(() => levantarApi('admin'));
after(() => cerrarApi());

const nuevoPropietario = () => crearUsuario({ rol: 'PROPIETARIO' });
const MOTIVO = 'Las fotos no muestran el lugar';

/** Un estacionamiento recien cargado, esperando revision, y un admin. */
async function escenario() {
  const propietario = await nuevoPropietario();
  const admin = await crearAdmin();
  const estacionamiento = await crearEstacionamiento(propietario.token, { aprobado: false });
  return { propietario, admin, estacionamiento, id: estacionamiento.id_estacionamiento };
}

describe('cola de revision', () => {
  test('lista los PENDIENTES, el mas viejo primero, con los datos del propietario', async () => {
    const { propietario, admin, id: viejo } = await escenario();
    const nuevo = (await crearEstacionamiento(propietario.token, { aprobado: false })).id_estacionamiento;
    await query(`UPDATE estacionamiento SET enviado_en = now() - interval '2 days' WHERE id_estacionamiento = $1`, [viejo]);

    const { estado, datos } = await api('GET', '/admin/estacionamientos', { token: admin.token });
    assert.equal(estado, 200);

    const ids = datos.estacionamientos.map((e) => e.id_estacionamiento);
    assert.ok(ids.indexOf(viejo) < ids.indexOf(nuevo));
    assert.ok(ids.indexOf(nuevo) >= 0);

    const fila = datos.estacionamientos.find((e) => e.id_estacionamiento === viejo);
    assert.equal(fila.propietario.email, propietario.email);
    assert.ok(datos.estacionamientos.every((e) => e.estado_aprobacion === 'PENDIENTE'));
  });

  test('filtra por estado', async () => {
    const { admin, id } = await escenario();
    await api('PATCH', `/admin/estacionamientos/${id}/rechazar`, { token: admin.token, body: { motivo: MOTIVO } });

    const { datos } = await api('GET', '/admin/estacionamientos?estado=RECHAZADO', { token: admin.token });
    assert.ok(datos.estacionamientos.some((e) => e.id_estacionamiento === id));
    assert.ok(datos.estacionamientos.every((e) => e.estado_aprobacion === 'RECHAZADO'));
  });

  test('el admin ve el detalle de un PENDIENTE con el propietario', async () => {
    const { propietario, admin, id } = await escenario();
    const { estado, datos } = await api('GET', `/admin/estacionamientos/${id}`, { token: admin.token });

    assert.equal(estado, 200);
    assert.equal(datos.estacionamiento.estado_aprobacion, 'PENDIENTE');
    assert.equal(datos.estacionamiento.propietario.email, propietario.email);
    assert.ok(Array.isArray(datos.estacionamiento.cocheras));
  });

  test('el admin tambien ve un PENDIENTE por el detalle publico', async () => {
    const { admin, id } = await escenario();
    const { estado } = await api('GET', `/estacionamientos/${id}`, { token: admin.token });
    assert.equal(estado, 200);
  });
});

describe('aprobar y rechazar', () => {
  test('aprobar lo deja APROBADO, aparece en la busqueda y aprobar de nuevo da 409', async () => {
    const { admin, estacionamiento, id } = await escenario();

    const aprobado = await api('PATCH', `/admin/estacionamientos/${id}/aprobar`, { token: admin.token });
    assert.equal(aprobado.estado, 200);
    assert.equal(aprobado.datos.estacionamiento.estado_aprobacion, 'APROBADO');

    const { rows } = await query('SELECT revisado_por, revisado_en FROM estacionamiento WHERE id_estacionamiento = $1', [id]);
    assert.equal(rows[0].revisado_por, admin.id);
    assert.ok(rows[0].revisado_en);

    const busqueda = await api('GET', `/estacionamientos?q=${encodeURIComponent(estacionamiento.nombre)}`);
    assert.ok(busqueda.datos.estacionamientos.some((e) => e.id_estacionamiento === id));

    const otraVez = await api('PATCH', `/admin/estacionamientos/${id}/aprobar`, { token: admin.token });
    assert.equal(otraVez.estado, 409);
  });

  test('rechazar sin motivo o con menos de 10 caracteres da 400', async () => {
    const { admin, id } = await escenario();
    const ruta = `/admin/estacionamientos/${id}/rechazar`;

    assert.equal((await api('PATCH', ruta, { token: admin.token, body: {} })).estado, 400);
    assert.equal((await api('PATCH', ruta, { token: admin.token, body: { motivo: 'corto' } })).estado, 400);
  });

  test('rechazar con motivo deja RECHAZADO y el propietario ve el motivo', async () => {
    const { propietario, admin, id } = await escenario();

    const rechazo = await api('PATCH', `/admin/estacionamientos/${id}/rechazar`, {
      token: admin.token,
      body: { motivo: MOTIVO },
    });
    assert.equal(rechazo.estado, 200);
    assert.equal(rechazo.datos.estacionamiento.estado_aprobacion, 'RECHAZADO');

    const mios = await api('GET', '/estacionamientos/mios', { token: propietario.token });
    const mio = mios.datos.estacionamientos.find((e) => e.id_estacionamiento === id);
    assert.equal(mio.estado_aprobacion, 'RECHAZADO');
    assert.equal(mio.motivo_rechazo, MOTIVO);
  });

  test('aprobar uno que no existe da 404', async () => {
    const admin = await crearAdmin();
    const respuesta = await api('PATCH', `/admin/estacionamientos/${crypto.randomUUID()}/aprobar`, {
      token: admin.token,
    });
    assert.equal(respuesta.estado, 404);
  });

  test('conductor y propietario reciben 403 en /admin', async () => {
    const { propietario, id } = await escenario();
    const conductor = await crearUsuario();

    for (const { token } of [propietario, conductor]) {
      assert.equal((await api('GET', '/admin/estacionamientos', { token })).estado, 403);
      assert.equal((await api('PATCH', `/admin/estacionamientos/${id}/aprobar`, { token })).estado, 403);
    }
  });
});

describe('el perfil de administrador es aparte', () => {
  const registro = (rol) =>
    api('POST', '/auth/register', {
      body: {
        nombre: 'Prueba',
        apellido: 'Parkit',
        email: `${crypto.randomUUID()}@admin.prueba.parkit`,
        password: 'prueba1234',
        rol,
      },
    });

  test('registrarse como ADMINISTRADOR da 400', async () => {
    const respuesta = await registro('ADMINISTRADOR');
    assert.equal(respuesta.estado, 400);
  });

  test('un propietario no puede agregarse ADMINISTRADOR', async () => {
    const propietario = await nuevoPropietario();
    const respuesta = await api('PATCH', '/auth/me', {
      token: propietario.token,
      body: { roles: ['PROPIETARIO', 'ADMINISTRADOR'] },
    });
    assert.equal(respuesta.estado, 400);

    const { rows } = await query('SELECT roles::text[] AS roles FROM usuario WHERE id_usuario = $1', [propietario.id]);
    assert.deepEqual(rows[0].roles, ['PROPIETARIO']);
  });

  test('un admin no puede agregarse otro perfil', async () => {
    const admin = await crearAdmin();
    const respuesta = await api('PATCH', '/auth/me', {
      token: admin.token,
      body: { roles: ['PROPIETARIO'] },
    });
    assert.equal(respuesta.estado, 400);
    assert.match(motivo(respuesta), /administrador no puede tener otros perfiles/);
  });

  test('un admin no puede cambiar su sesion a otro perfil', async () => {
    const admin = await crearAdmin();
    const respuesta = await api('POST', '/auth/rol', { token: admin.token, body: { rol: 'PROPIETARIO' } });
    assert.ok([400, 403].includes(respuesta.estado));

    const yo = await api('GET', '/auth/me', { token: admin.token });
    assert.equal(yo.datos.usuario.rol, 'ADMINISTRADOR');
  });

  test('el admin puede editar su nombre sin tocar perfiles', async () => {
    const admin = await crearAdmin();
    const respuesta = await api('PATCH', '/auth/me', { token: admin.token, body: { nombre: 'Admina' } });
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(respuesta.datos.usuario.roles, ['ADMINISTRADOR']);
  });
});
