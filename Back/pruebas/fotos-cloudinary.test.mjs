// Fotos en Cloudinary: el navegador sube con una firma y la API guarda el
// public_id. Con CLOUDINARY_ENABLED=false (ayuda.mjs) no se llama a su API:
// se prueba la firma, el control de carpeta y lo que se guarda y se sirve.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { config } from '../src/config/env.js';
import { MAX_FOTOS } from '../src/services/estacionamiento-foto.service.js';
import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  levantarApi,
  query,
} from './ayuda.mjs';

before(() => levantarApi('fotoscloud'));
after(() => cerrarApi());

const carpetaEst = (id) => `${config.cloudinary.carpeta}/estacionamientos/${id}`;
const carpetaVeh = (id) => `${config.cloudinary.carpeta}/vehiculos/${id}`;

async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  const id = estacionamiento.id_estacionamiento;
  return { propietario, id, ruta: `/estacionamientos/${id}` };
}

describe('fotos de estacionamientos', () => {
  test('el dueno pide una firma para la carpeta de su estacionamiento', async () => {
    const { propietario, id, ruta } = await escenario();

    const { estado, datos } = await api('POST', `${ruta}/fotos/firma`, { token: propietario.token });
    assert.equal(estado, 200);
    assert.ok(datos.firma.publicId.startsWith(`${carpetaEst(id)}/`));
    assert.ok(datos.firma.signature);
    assert.ok(!JSON.stringify(datos).includes(config.cloudinary.apiSecret));
  });

  test('otro propietario y un conductor no pueden pedir la firma', async () => {
    const { ruta } = await escenario();
    const ajeno = await crearUsuario({ rol: 'PROPIETARIO' });
    const conductor = await crearUsuario();

    assert.equal((await api('POST', `${ruta}/fotos/firma`, { token: ajeno.token })).estado, 403);
    assert.equal((await api('POST', `${ruta}/fotos/firma`, { token: conductor.token })).estado, 403);
  });

  test('una portada con public_id de otro estacionamiento da 400', async () => {
    const { propietario, ruta } = await escenario();
    const otro = await escenario();

    const respuesta = await api('PUT', `${ruta}/foto`, {
      token: propietario.token,
      body: { public_id: `${carpetaEst(otro.id)}/robada` },
    });
    assert.equal(respuesta.estado, 400);
  });

  test('la portada con public_id se sirve con un 302 a Cloudinary', async () => {
    const { propietario, id, ruta } = await escenario();
    const publicId = `${carpetaEst(id)}/portada1`;

    const guardada = await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: publicId } });
    assert.equal(guardada.estado, 200);

    const foto = await api('GET', `${ruta}/foto`, { redirect: 'manual' });
    assert.equal(foto.estado, 302);
    assert.match(foto.headers.get('location'), /^https:\/\/res\.cloudinary\.com\//);
    assert.ok(foto.headers.get('location').includes(publicId));

    const { rows } = await query('SELECT bytes FROM estacionamiento_imagen WHERE public_id = $1', [publicId]);
    assert.equal(rows[0].bytes, null);
  });

  test('reemplazar la portada guarda el public_id nuevo', async () => {
    const { propietario, id, ruta } = await escenario();
    await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: `${carpetaEst(id)}/a` } });
    await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: `${carpetaEst(id)}/b` } });

    const { rows } = await query(
      'SELECT public_id FROM estacionamiento_imagen WHERE id_estacionamiento = $1',
      [id],
    );
    assert.deepEqual(rows.map((r) => r.public_id), [`${carpetaEst(id)}/b`]);
  });

  test('una foto vieja con bytes se sigue sirviendo', async () => {
    const { propietario, ruta } = await escenario();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    await api('PUT', `${ruta}/foto`, { token: propietario.token, raw: png, contentType: 'image/png' });

    const foto = await api('GET', `${ruta}/foto`, { redirect: 'manual' });
    assert.equal(foto.estado, 200);
    assert.ok(foto.datos.equals(png));
  });

  test('la galeria acepta public_id y respeta el tope de fotos', async () => {
    const { propietario, id, ruta } = await escenario();
    for (let i = 0; i < MAX_FOTOS; i++) {
      const alta = await api('POST', `${ruta}/fotos`, {
        token: propietario.token,
        body: { public_id: `${carpetaEst(id)}/g${i}` },
      });
      assert.equal(alta.estado, 201);
    }
    const demas = await api('POST', `${ruta}/fotos`, {
      token: propietario.token,
      body: { public_id: `${carpetaEst(id)}/demas` },
    });
    assert.equal(demas.estado, 409);
  });
});

describe('foto del vehiculo', () => {
  async function conVehiculo() {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    return { conductor, vehiculo, ruta: `/vehiculos/${vehiculo.id_vehiculo}` };
  }
  const fotoDe = async (conductor, idVehiculo) => {
    const { datos } = await api('GET', '/vehiculos', { token: conductor.token });
    return datos.vehiculos.find((v) => v.id_vehiculo === idVehiculo).foto_url;
  };

  test('el conductor pide la firma para la carpeta de su vehiculo', async () => {
    const { conductor, vehiculo, ruta } = await conVehiculo();
    const { estado, datos } = await api('POST', `${ruta}/foto/firma`, { token: conductor.token });

    assert.equal(estado, 200);
    assert.ok(datos.firma.publicId.startsWith(`${carpetaVeh(vehiculo.id_vehiculo)}/`));
  });

  test('otro conductor no puede firmar ni cambiar la foto', async () => {
    const { vehiculo, ruta } = await conVehiculo();
    const ajeno = await crearUsuario();

    assert.equal((await api('POST', `${ruta}/foto/firma`, { token: ajeno.token })).estado, 404);
    const cambio = await api('PUT', `${ruta}/foto`, {
      token: ajeno.token,
      body: { public_id: `${carpetaVeh(vehiculo.id_vehiculo)}/x` },
    });
    assert.equal(cambio.estado, 404);
  });

  test('una foto de otra carpeta da 400', async () => {
    const { conductor, ruta } = await conVehiculo();
    const otro = await conVehiculo();
    const respuesta = await api('PUT', `${ruta}/foto`, {
      token: conductor.token,
      body: { public_id: `${carpetaVeh(otro.vehiculo.id_vehiculo)}/x` },
    });
    assert.equal(respuesta.estado, 400);
  });

  test('con foto el vehiculo trae foto_url; al borrarla vuelve a null', async () => {
    const { conductor, vehiculo, ruta } = await conVehiculo();
    assert.equal(await fotoDe(conductor, vehiculo.id_vehiculo), null);

    const publicId = `${carpetaVeh(vehiculo.id_vehiculo)}/auto`;
    const guardada = await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: publicId } });
    assert.equal(guardada.estado, 200);
    assert.ok((await fotoDe(conductor, vehiculo.id_vehiculo)).includes(publicId));

    const borrada = await api('DELETE', `${ruta}/foto`, { token: conductor.token });
    assert.equal(borrada.estado, 204);
    assert.equal(await fotoDe(conductor, vehiculo.id_vehiculo), null);
  });
});
