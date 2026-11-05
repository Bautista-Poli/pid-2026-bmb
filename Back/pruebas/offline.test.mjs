// Modo offline (OFFLINE=true): las fotos se suben a la API y se guardan en disco,
// con el mismo contrato que Cloudinary (firma -> subida -> public_id). Sin OFFLINE
// esas rutas no existen.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { api, cerrarApi, crearEstacionamiento, crearUsuario, crearVehiculo, levantarApi } from './ayuda.mjs';

// El JPEG mas chico que reconoce la deteccion por bytes: cabecera + algo de relleno.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);

let carpeta;

before(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'parkit-offline-'));
  process.env.DATOS_LOCALES_DIR = carpeta;
  process.env.OFFLINE = 'true';
  await levantarApi('offline');
});

after(async () => {
  delete process.env.OFFLINE;
  delete process.env.DATOS_LOCALES_DIR;
  await cerrarApi();
  await rm(carpeta, { recursive: true, force: true });
});

/** Sube `bytes` con la firma, como hace el navegador. */
function subir(firma, bytes, { contentType = 'image/jpeg', signature = firma.signature } = {}) {
  const query = new URLSearchParams({ public_id: firma.publicId, timestamp: String(firma.timestamp), signature });
  return api('POST', `/fotos-locales?${query}`, { raw: bytes, contentType });
}

/** `/api/fotos-locales/...` -> la ruta para `api()`, que ya antepone /api. */
const sinPrefijo = (url) => url.replace(/^\/api/, '');

async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token);
  return { propietario, ruta: `/estacionamientos/${estacionamiento.id_estacionamiento}` };
}

describe('modo offline', () => {
  test('/entorno avisa que esta offline', async () => {
    const { datos } = await api('GET', '/entorno');
    assert.deepEqual(datos, { offline: true });
  });

  test('la foto de un estacionamiento se sube a la API, se guarda y se sirve desde disco', async () => {
    const { propietario, ruta } = await escenario();

    const { datos } = await api('POST', `${ruta}/fotos/firma`, { token: propietario.token });
    assert.equal(datos.firma.urlSubida, '/fotos-locales');

    const subida = await subir(datos.firma, JPEG);
    assert.equal(subida.estado, 201);

    const guardada = await api('PUT', `${ruta}/foto`, {
      token: propietario.token,
      body: { public_id: datos.firma.publicId },
    });
    assert.equal(guardada.estado, 200);

    const portada = await api('GET', `${ruta}/foto`, { redirect: 'manual' });
    assert.equal(portada.estado, 302);
    const location = portada.headers.get('location');
    assert.equal(location, `/api/fotos-locales/${datos.firma.publicId}`);

    const foto = await api('GET', sinPrefijo(location));
    assert.equal(foto.estado, 200);
    assert.equal(foto.headers.get('content-type'), 'image/jpeg');
    assert.ok(foto.datos.equals(JPEG));
  });

  test('un public_id que no se subio no se puede asociar', async () => {
    const { propietario, ruta } = await escenario();
    const { datos } = await api('POST', `${ruta}/fotos/firma`, { token: propietario.token });

    const respuesta = await api('PUT', `${ruta}/foto`, {
      token: propietario.token,
      body: { public_id: datos.firma.publicId },
    });
    assert.equal(respuesta.estado, 400);
  });

  test('sin firma valida, o si no es una imagen, la subida se rechaza', async () => {
    const { propietario, ruta } = await escenario();
    const { datos } = await api('POST', `${ruta}/fotos/firma`, { token: propietario.token });

    assert.equal((await subir(datos.firma, JPEG, { signature: 'f'.repeat(64) })).estado, 403);
    assert.equal((await subir({ ...datos.firma, publicId: `${datos.firma.publicId}x` }, JPEG)).estado, 403);
    assert.equal((await subir(datos.firma, Buffer.from('no soy una imagen'))).estado, 400);
  });

  test('un public_id con .. no sale de la carpeta de fotos', async () => {
    // %2F llega al servidor como parte del tramo (fetch no lo normaliza como a ../).
    const respuesta = await api('GET', '/fotos-locales/..%2F..%2F..%2Fpackage.json');
    assert.equal(respuesta.estado, 404);
  });

  test('la foto del vehiculo queda con URL local; reemplazarla borra la anterior', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const ruta = `/vehiculos/${vehiculo.id_vehiculo}/foto`;

    const primera = (await api('POST', `${ruta}/firma`, { token: conductor.token })).datos.firma;
    assert.equal((await subir(primera, JPEG)).estado, 201);
    const conFoto = await api('PUT', ruta, { token: conductor.token, body: { public_id: primera.publicId } });
    assert.equal(conFoto.estado, 200);
    assert.equal(conFoto.datos.vehiculo.foto_url, `/api/fotos-locales/${primera.publicId}`);

    const segunda = (await api('POST', `${ruta}/firma`, { token: conductor.token })).datos.firma;
    assert.equal((await subir(segunda, PNG, { contentType: 'image/png' })).estado, 201);
    await api('PUT', ruta, { token: conductor.token, body: { public_id: segunda.publicId } });

    assert.equal((await api('GET', `/fotos-locales/${primera.publicId}`)).estado, 404);
    const nueva = await api('GET', `/fotos-locales/${segunda.publicId}`);
    assert.equal(nueva.headers.get('content-type'), 'image/png');
  });

  test('sin geocodificar, las coordenadas que marca el propietario se conservan al cambiar la direccion', async () => {
    const { propietario, ruta } = await escenario();
    const ubicacion = { latitud: -34.588, longitud: -58.43 };

    const marcada = await api('PATCH', ruta, { token: propietario.token, body: { calle: 'Gurruchaga', ...ubicacion } });
    assert.equal(marcada.estado, 200);

    const otraCalle = await api('PATCH', ruta, { token: propietario.token, body: { calle: 'Honduras', ...ubicacion } });
    assert.equal(otraCalle.estado, 200);
    assert.equal(otraCalle.datos.estacionamiento.latitud, ubicacion.latitud);
    assert.equal(otraCalle.datos.estacionamiento.longitud, ubicacion.longitud);
  });

  test('sin OFFLINE las rutas locales no existen', async () => {
    delete process.env.OFFLINE;
    try {
      assert.equal((await api('GET', '/fotos-locales/x/y')).estado, 404);
      assert.deepEqual((await api('GET', '/entorno')).datos, { offline: false });
    } finally {
      process.env.OFFLINE = 'true';
    }
  });
});
