// Cliente de Cloudinary: firma de las llamadas y subida/borrado. No toca la red
// ni la base: `fetch` se reemplaza por una version que devuelve respuestas fijas.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { config } from '../src/config/env.js';
import { borrarImagen, firmar, subirImagen } from '../src/services/cloudinary.service.js';

const { cloudName, apiKey, apiSecret, carpeta } = config.cloudinary;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  Object.assign(config.cloudinary, {
    cloudName: 'demo',
    apiKey: '123',
    apiSecret: 'secreto',
    carpeta: 'parkit/test',
  });
});

afterEach(() => {
  Object.assign(config.cloudinary, { cloudName, apiKey, apiSecret, carpeta });
  globalThis.fetch = fetchOriginal;
});

/** Reemplaza fetch por una respuesta fija y guarda cada llamada. */
function simularCloudinary(respuesta, estado = 200) {
  const llamadas = [];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, body: opciones.body });
    return new Response(JSON.stringify(respuesta), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    });
  };
  return llamadas;
}

describe('firma', () => {
  test('sha1 de los parametros ordenados por nombre mas la secret', () => {
    const esperada = createHash('sha1')
      .update('public_id=sample&timestamp=1315060510abcd')
      .digest('hex');
    assert.equal(firmar({ timestamp: 1315060510, public_id: 'sample' }, 'abcd'), esperada);
  });
});

describe('subida', () => {
  test('firma la subida y devuelve public_id y URL segura', async () => {
    const llamadas = simularCloudinary({
      public_id: 'parkit/test/abc',
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/parkit/test/abc.jpg',
    });

    const resultado = await subirImagen(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');

    assert.deepEqual(resultado, {
      cloudinary_id: 'parkit/test/abc',
      url: 'https://res.cloudinary.com/demo/image/upload/v1/parkit/test/abc.jpg',
    });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, 'https://api.cloudinary.com/v1_1/demo/image/upload');

    const form = llamadas[0].body;
    const timestamp = form.get('timestamp');
    assert.equal(form.get('api_key'), '123');
    assert.equal(form.get('folder'), 'parkit/test');
    assert.equal(form.get('signature'), firmar({ folder: 'parkit/test', timestamp: Number(timestamp) }, 'secreto'));
  });

  test('si Cloudinary rechaza la subida, responde 502 sin guardar nada', async () => {
    simularCloudinary({ error: { message: 'Invalid Signature' } }, 401);

    await assert.rejects(subirImagen(Buffer.from([1, 2, 3]), 'image/png'), {
      statusCode: 502,
    });
  });
});

describe('borrado', () => {
  test('pide el borrado firmado del public_id', async () => {
    const llamadas = simularCloudinary({ result: 'ok' });

    await borrarImagen('parkit/test/abc');

    assert.equal(llamadas[0].url, 'https://api.cloudinary.com/v1_1/demo/image/destroy');
    const params = llamadas[0].body;
    assert.equal(params.get('public_id'), 'parkit/test/abc');
    assert.equal(
      params.get('signature'),
      firmar({ public_id: 'parkit/test/abc', timestamp: Number(params.get('timestamp')) }, 'secreto'),
    );
  });

  test('lanza si Cloudinary no pudo borrar la imagen', async () => {
    simularCloudinary({ result: 'error' });

    await assert.rejects(borrarImagen('parkit/test/abc'), /no pudo borrar/);
  });
});
