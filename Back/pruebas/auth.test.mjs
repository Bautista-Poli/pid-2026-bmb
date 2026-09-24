// Registro, login, perfil y baja de cuenta.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cambiarRol,
  cerrarApi,
  crearUsuario,
  levantarApi,
  motivo,
  PASSWORD,
} from './ayuda.mjs';

before(() => levantarApi('auth'));
after(() => cerrarApi());

describe('registro y login', () => {
  test('registra, devuelve token y no expone la contrasena', async () => {
    const usuario = await crearUsuario();
    const { estado, datos } = await api('GET', '/auth/me', { token: usuario.token });

    assert.equal(estado, 200);
    assert.equal(datos.usuario.email, usuario.email);
    assert.equal(datos.usuario.password_hash, undefined);
    assert.deepEqual(datos.usuario.roles, ['CONDUCTOR']);
  });

  test('rechaza un email repetido', async () => {
    const usuario = await crearUsuario();
    const repetido = await api('POST', '/auth/register', {
      body: {
        nombre: 'Otro',
        apellido: 'Usuario',
        email: usuario.email,
        password: PASSWORD,
        rol: 'CONDUCTOR',
      },
    });

    assert.equal(repetido.estado, 409);
  });

  test('rechaza una contrasena corta', async () => {
    const corta = await api('POST', '/auth/register', {
      body: {
        nombre: 'Prueba',
        apellido: 'Parkit',
        email: 'corta@prueba.parkit',
        password: '123',
        rol: 'CONDUCTOR',
      },
    });

    assert.equal(corta.estado, 400);
  });

  test('login con la contrasena correcta y con una incorrecta', async () => {
    const usuario = await crearUsuario();

    const ok = await api('POST', '/auth/login', {
      body: { email: usuario.email, password: PASSWORD },
    });
    assert.equal(ok.estado, 200);
    assert.match(ok.headers.get('set-cookie') ?? '', /^parkit_token=.+HttpOnly/i);

    const mal = await api('POST', '/auth/login', {
      body: { email: usuario.email, password: 'otracosa' },
    });
    assert.equal(mal.estado, 401);
  });

  test('sin token no se accede al perfil', async () => {
    const { estado } = await api('GET', '/auth/me');
    assert.equal(estado, 401);
  });

  test('logout borra la cookie de sesion', async () => {
    const { estado, headers } = await api('POST', '/auth/logout');
    assert.equal(estado, 204);
    assert.match(headers.get('set-cookie') ?? '', /^parkit_token=;/);
  });
});

describe('perfil', () => {
  test('edita los datos', async () => {
    const usuario = await crearUsuario();
    const { estado, datos } = await api('PATCH', '/auth/me', {
      token: usuario.token,
      body: { nombre: 'Editado', telefono: '1144556677' },
    });

    assert.equal(estado, 200);
    assert.equal(datos.usuario.nombre, 'Editado');
    assert.equal(datos.usuario.telefono, '1144556677');
  });

  test('cambiar la contrasena exige la actual y que sea correcta', async () => {
    const usuario = await crearUsuario();

    const sinActual = await api('PATCH', '/auth/me', {
      token: usuario.token,
      body: { password: 'otraclave123' },
    });
    assert.equal(sinActual.estado, 400);

    const actualMal = await api('PATCH', '/auth/me', {
      token: usuario.token,
      body: { password: 'otraclave123', passwordActual: 'noesla' },
    });
    assert.equal(actualMal.estado, 401);

    const ok = await api('PATCH', '/auth/me', {
      token: usuario.token,
      body: { password: 'otraclave123', passwordActual: PASSWORD },
    });
    assert.equal(ok.estado, 200);

    const login = await api('POST', '/auth/login', {
      body: { email: usuario.email, password: 'otraclave123' },
    });
    assert.equal(login.estado, 200);
  });

  test('habilita el segundo perfil y cambia el activo', async () => {
    const usuario = await crearUsuario({ roles: ['CONDUCTOR', 'PROPIETARIO'] });

    const perfil = await api('GET', '/auth/me', { token: usuario.token });
    assert.deepEqual(perfil.datos.usuario.roles.sort(), ['CONDUCTOR', 'PROPIETARIO']);

    const comoPropietario = await cambiarRol(usuario.token, 'PROPIETARIO');
    const mios = await api('GET', '/estacionamientos/mios', { token: comoPropietario });
    assert.equal(mios.estado, 200);
  });

  test('el conductor no entra a lo del propietario', async () => {
    const usuario = await crearUsuario();
    const { estado } = await api('GET', '/estacionamientos/mios', { token: usuario.token });
    assert.equal(estado, 403);
  });

  test('un rol que no esta habilitado no se puede activar', async () => {
    const usuario = await crearUsuario();
    const { estado } = await api('POST', '/auth/rol', {
      token: usuario.token,
      body: { rol: 'PROPIETARIO' },
    });
    assert.equal(estado, 403);
  });
});

describe('baja de cuenta', () => {
  test('da de baja y el token deja de servir', async () => {
    const usuario = await crearUsuario();

    const baja = await api('DELETE', '/auth/me', { token: usuario.token });
    assert.equal(baja.estado, 204);

    const despues = await api('GET', '/auth/me', { token: usuario.token });
    assert.equal(despues.estado, 401);
    assert.match(motivo(despues), /activa/i);

    const login = await api('POST', '/auth/login', {
      body: { email: usuario.email, password: PASSWORD },
    });
    assert.equal(login.estado, 403);
  });
});
