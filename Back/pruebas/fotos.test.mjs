// Fotos en disco: el navegador pide una firma, sube la imagen a la API
// (POST /api/fotos-locales) y despues asocia el public_id al recurso.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { MAX_FOTOS } from '../src/services/estacionamiento-foto.service.js';
import { carpetaDe } from '../src/services/fotos.service.js';
import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  levantarApi,
  query,
} from './ayuda.mjs';

// El JPEG mas chico que reconoce la deteccion por bytes: cabecera + algo de relleno.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);

let carpeta;

before(async () => {
  // Las fotos de las pruebas van a una carpeta temporal, no a Back/datos-locales.
  carpeta = await mkdtemp(join(tmpdir(), 'parkit-fotos-'));
  process.env.DATOS_LOCALES_DIR = carpeta;
  await levantarApi('fotos');
});

after(async () => {
  delete process.env.DATOS_LOCALES_DIR;
  await cerrarApi();
  await rm(carpeta, { recursive: true, force: true });
});

const carpetaEst = (id) => carpetaDe('estacionamientos', id);
const carpetaVeh = (id) => carpetaDe('vehiculos', id);

/** Sube `bytes` con la firma, como hace el navegador. */
function subir(firma, bytes, { contentType = 'image/jpeg', signature = firma.signature } = {}) {
  const query = new URLSearchParams({ public_id: firma.publicId, timestamp: String(firma.timestamp), signature });
  return api('POST', `/fotos-locales?${query}`, { raw: bytes, contentType });
}

/** Pide la firma en `rutaFirma`, sube un JPEG y devuelve su public_id. */
async function subirFoto(rutaFirma, token) {
  const { datos } = await api('POST', rutaFirma, { token });
  assert.equal((await subir(datos.firma, JPEG)).estado, 201);
  return datos.firma.publicId;
}

/** `/api/fotos-locales/...` -> la ruta para `api()`, que ya antepone /api. */
const sinPrefijo = (url) => url.replace(/^\/api/, '');

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
    assert.equal(datos.firma.urlSubida, '/fotos-locales');
  });

  test('otro propietario y un conductor no pueden pedir la firma', async () => {
    const { ruta } = await escenario();
    const ajeno = await crearUsuario({ rol: 'PROPIETARIO' });
    const conductor = await crearUsuario();

    assert.equal((await api('POST', `${ruta}/fotos/firma`, { token: ajeno.token })).estado, 403);
    assert.equal((await api('POST', `${ruta}/fotos/firma`, { token: conductor.token })).estado, 403);
  });

  test('la foto se sube a la API, se guarda y se sirve desde disco', async () => {
    const { propietario, ruta } = await escenario();
    const publicId = await subirFoto(`${ruta}/fotos/firma`, propietario.token);

    const guardada = await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: publicId } });
    assert.equal(guardada.estado, 200);

    const portada = await api('GET', `${ruta}/foto`, { redirect: 'manual' });
    assert.equal(portada.estado, 302);
    const location = portada.headers.get('location');
    assert.equal(location, `/api/fotos-locales/${publicId}`);

    const foto = await api('GET', sinPrefijo(location));
    assert.equal(foto.estado, 200);
    assert.equal(foto.headers.get('content-type'), 'image/jpeg');
    assert.ok(foto.datos.equals(JPEG));

    const { rows } = await query('SELECT bytes FROM estacionamiento_imagen WHERE public_id = $1', [publicId]);
    assert.equal(rows[0].bytes, null);
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

  test('una portada con public_id de otro estacionamiento da 400', async () => {
    const { propietario, ruta } = await escenario();
    const otro = await escenario();
    const ajena = await subirFoto(`${otro.ruta}/fotos/firma`, otro.propietario.token);

    const respuesta = await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: ajena } });
    assert.equal(respuesta.estado, 400);
  });

  test('reemplazar la portada guarda el public_id nuevo y borra la anterior', async () => {
    const { propietario, id, ruta } = await escenario();
    const a = await subirFoto(`${ruta}/fotos/firma`, propietario.token);
    const b = await subirFoto(`${ruta}/fotos/firma`, propietario.token);
    await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: a } });
    await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: b } });

    const { rows } = await query('SELECT public_id FROM estacionamiento_imagen WHERE id_estacionamiento = $1', [id]);
    assert.deepEqual(rows.map((r) => r.public_id), [b]);
    assert.equal((await api('GET', `/fotos-locales/${a}`)).estado, 404);
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
    const { propietario, ruta } = await escenario();
    for (let i = 0; i < MAX_FOTOS; i++) {
      const publicId = await subirFoto(`${ruta}/fotos/firma`, propietario.token);
      const alta = await api('POST', `${ruta}/fotos`, { token: propietario.token, body: { public_id: publicId } });
      assert.equal(alta.estado, 201);
    }
    const demas = await subirFoto(`${ruta}/fotos/firma`, propietario.token);
    const respuesta = await api('POST', `${ruta}/fotos`, { token: propietario.token, body: { public_id: demas } });
    assert.equal(respuesta.estado, 409);
  });

  test('una misma foto no puede quedar en dos lugares', async () => {
    const { propietario, ruta } = await escenario();
    const publicId = await subirFoto(`${ruta}/fotos/firma`, propietario.token);

    const portada = await api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: publicId } });
    assert.equal(portada.estado, 200);
    const galeria = await api('POST', `${ruta}/fotos`, { token: propietario.token, body: { public_id: publicId } });
    assert.equal(galeria.estado, 409);
  });

  test('dos reemplazos de portada a la vez dejan una sola portada', async () => {
    const { propietario, id, ruta } = await escenario();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await subirFoto(`${ruta}/fotos/firma`, propietario.token));
    await Promise.all(
      ids.map((publicId) => api('PUT', `${ruta}/foto`, { token: propietario.token, body: { public_id: publicId } })),
    );
    const { rows } = await query('SELECT count(*)::int AS n FROM estacionamiento_imagen WHERE id_estacionamiento = $1', [id]);
    assert.equal(rows[0].n, 1);
  });

  test('pedir firmas sin parar termina en 429', async () => {
    const { propietario, ruta } = await escenario();
    let estado = 200;
    for (let i = 0; i < 40 && estado === 200; i++) {
      estado = (await api('POST', `${ruta}/fotos/firma`, { token: propietario.token })).estado;
    }
    assert.equal(estado, 429);
  });
});

describe('subida a /fotos-locales', () => {
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
    const ajena = await subirFoto(`${otro.ruta}/foto/firma`, otro.conductor.token);
    const respuesta = await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: ajena } });
    assert.equal(respuesta.estado, 400);
  });

  test('con foto el vehiculo trae foto_url local; al borrarla vuelve a null', async () => {
    const { conductor, vehiculo, ruta } = await conVehiculo();
    assert.equal(await fotoDe(conductor, vehiculo.id_vehiculo), null);

    const publicId = await subirFoto(`${ruta}/foto/firma`, conductor.token);
    const guardada = await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: publicId } });
    assert.equal(guardada.estado, 200);
    assert.equal(guardada.datos.vehiculo.foto_url, `/api/fotos-locales/${publicId}`);
    assert.equal(guardada.datos.vehiculo.foto_miniatura_url, `/api/fotos-locales/${publicId}`);

    const borrada = await api('DELETE', `${ruta}/foto`, { token: conductor.token });
    assert.equal(borrada.estado, 204);
    assert.equal(await fotoDe(conductor, vehiculo.id_vehiculo), null);
  });

  test('reemplazar la foto borra la anterior del disco', async () => {
    const { conductor, ruta } = await conVehiculo();
    const firmaDe = async () => (await api('POST', `${ruta}/foto/firma`, { token: conductor.token })).datos.firma;

    const primera = await firmaDe();
    assert.equal((await subir(primera, JPEG)).estado, 201);
    await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: primera.publicId } });

    const segunda = await firmaDe();
    assert.equal((await subir(segunda, PNG, { contentType: 'image/png' })).estado, 201);
    await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: segunda.publicId } });

    assert.equal((await api('GET', `/fotos-locales/${primera.publicId}`)).estado, 404);
    const nueva = await api('GET', `/fotos-locales/${segunda.publicId}`);
    assert.equal(nueva.headers.get('content-type'), 'image/png');
  });

  test('un vehiculo dado de baja no recibe foto y al darlo de baja se le saca', async () => {
    const { conductor, vehiculo, ruta } = await conVehiculo();
    const publicId = await subirFoto(`${ruta}/foto/firma`, conductor.token);
    await api('PUT', `${ruta}/foto`, { token: conductor.token, body: { public_id: publicId } });

    await api('DELETE', ruta, { token: conductor.token });
    const { rows } = await query('SELECT foto_public_id FROM vehiculo WHERE id_vehiculo = $1', [vehiculo.id_vehiculo]);
    assert.equal(rows[0].foto_public_id, null);

    assert.equal((await api('POST', `${ruta}/foto/firma`, { token: conductor.token })).estado, 404);
  });
});

describe('ubicacion del estacionamiento', () => {
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
});
