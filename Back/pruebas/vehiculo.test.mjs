// ABM de vehiculos del conductor.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearUsuario,
  crearVehiculo,
  levantarApi,
  patenteAlAzar,
} from './ayuda.mjs';

before(() => levantarApi('vehiculo'));
after(() => cerrarApi());

describe('vehiculos', () => {
  test('el primero queda predeterminado y el segundo no', async () => {
    const conductor = await crearUsuario();

    const primero = await crearVehiculo(conductor.token);
    assert.equal(primero.predeterminado, true);

    const segundo = await crearVehiculo(conductor.token);
    assert.equal(segundo.predeterminado, false);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    assert.equal(lista.estado, 200);
    assert.equal(lista.datos.vehiculos.length, 2);
  });

  test('marcar otro como predeterminado libera al anterior', async () => {
    const conductor = await crearUsuario();
    const primero = await crearVehiculo(conductor.token);
    const segundo = await crearVehiculo(conductor.token);

    const cambio = await api('PATCH', `/vehiculos/${segundo.id_vehiculo}`, {
      token: conductor.token,
      body: { predeterminado: true },
    });
    assert.equal(cambio.estado, 200);
    assert.equal(cambio.datos.vehiculo.predeterminado, true);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    const anterior = lista.datos.vehiculos.find((v) => v.id_vehiculo === primero.id_vehiculo);
    assert.equal(anterior.predeterminado, false);
  });

  test('no se repite la patente', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const repetida = await api('POST', '/vehiculos', {
      token: conductor.token,
      body: { patente: vehiculo.patente, id_tipo_vehiculo: 1 },
    });
    assert.equal(repetida.estado, 409);
  });

  test('acepta el formato viejo y el Mercosur de cada tipo', async () => {
    const conductor = await crearUsuario();
    // Formato viejo con numeros al azar para no chocar con otras corridas.
    const n = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    const casos = [
      { patente: `ZQX ${n}`, id_tipo_vehiculo: 1 },
      { patente: patenteAlAzar(3), id_tipo_vehiculo: 3 },
      { patente: `${n} zqx`, id_tipo_vehiculo: 2 },
      { patente: patenteAlAzar(2), id_tipo_vehiculo: 2 },
    ];

    for (const body of casos) {
      const { estado, datos } = await api('POST', '/vehiculos', { token: conductor.token, body });
      assert.equal(estado, 201, `${body.patente} (tipo ${body.id_tipo_vehiculo}) respondio ${estado}`);
      assert.equal(datos.vehiculo.patente, body.patente.toUpperCase().replace(/\s+/g, ''));
    }
  });

  test('rechaza una patente que no corresponde al tipo', async () => {
    const conductor = await crearUsuario();
    const casos = [
      { patente: patenteAlAzar(1), id_tipo_vehiculo: 2 },
      { patente: patenteAlAzar(2), id_tipo_vehiculo: 1 },
      { patente: '123ABC', id_tipo_vehiculo: 3 },
      { patente: 'PR123456', id_tipo_vehiculo: 1 },
    ];

    for (const body of casos) {
      const { estado, datos } = await api('POST', '/vehiculos', { token: conductor.token, body });
      assert.equal(estado, 400, `${body.patente} (tipo ${body.id_tipo_vehiculo}) respondio ${estado}`);
      assert.ok(JSON.stringify(datos).includes('patente'));
    }
  });

  test('el PATCH cruza lo que cambia con lo guardado', async () => {
    const conductor = await crearUsuario();
    const auto = await crearVehiculo(conductor.token);

    // Solo el tipo: la patente de auto guardada no sirve para moto.
    const soloTipo = await api('PATCH', `/vehiculos/${auto.id_vehiculo}`, {
      token: conductor.token,
      body: { id_tipo_vehiculo: 2 },
    });
    assert.equal(soloTipo.estado, 400);

    // Solo la patente: una de moto no sirve para el auto guardado.
    const soloPatente = await api('PATCH', `/vehiculos/${auto.id_vehiculo}`, {
      token: conductor.token,
      body: { patente: patenteAlAzar(2) },
    });
    assert.equal(soloPatente.estado, 400);

    // Las dos juntas y compatibles: pasa a ser moto.
    const ambas = await api('PATCH', `/vehiculos/${auto.id_vehiculo}`, {
      token: conductor.token,
      body: { patente: patenteAlAzar(2), id_tipo_vehiculo: 2 },
    });
    assert.equal(ambas.estado, 200);
    assert.equal(ambas.datos.vehiculo.id_tipo_vehiculo, 2);
  });

  test('edita marca y modelo', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const { estado, datos } = await api('PATCH', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: conductor.token,
      body: { marca: 'Renault', modelo: 'Sandero' },
    });

    assert.equal(estado, 200);
    assert.equal(datos.vehiculo.marca, 'Renault');
    assert.equal(datos.vehiculo.modelo, 'Sandero');
  });

  test('la baja es logica: deja de listarse', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);

    const baja = await api('DELETE', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: conductor.token,
    });
    assert.ok(baja.estado === 200 || baja.estado === 204, `respondio ${baja.estado}`);

    const lista = await api('GET', '/vehiculos', { token: conductor.token });
    assert.equal(
      lista.datos.vehiculos.some((v) => v.id_vehiculo === vehiculo.id_vehiculo),
      false,
    );
  });

  test('otro conductor no puede tocarlo', async () => {
    const duenio = await crearUsuario();
    const ajeno = await crearUsuario();
    const vehiculo = await crearVehiculo(duenio.token);

    const edicion = await api('PATCH', `/vehiculos/${vehiculo.id_vehiculo}`, {
      token: ajeno.token,
      body: { marca: 'Robada' },
    });
    assert.equal(edicion.estado, 404);
  });

  test('el catalogo de tipos es publico', async () => {
    const { estado, datos } = await api('GET', '/vehiculos/tipos');
    assert.equal(estado, 200);
    assert.ok(datos.tipos.length >= 3);
  });
});
