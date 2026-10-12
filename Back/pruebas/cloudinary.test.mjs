// Servicio de Cloudinary: firma de subidas, carpetas y URLs. No usa la red
// (CLOUDINARY_ENABLED=false apaga la verificacion contra su API) y no depende
// de credenciales reales: si faltan (p. ej. en CI) se usan unas de prueba.
process.env.CLOUDINARY_ENABLED = 'false';
process.env.CLOUDINARY_CLOUD_NAME ||= 'nube-de-prueba';
process.env.CLOUDINARY_API_KEY ||= '000000000000000';
process.env.CLOUDINARY_API_SECRET ||= 'secreto-de-prueba';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { v2 as cloudinary } from 'cloudinary';

import { config } from '../src/config/env.js';
import { carpetaDe, firmarSubida, url, verificar } from '../src/services/cloudinary.service.js';

describe('cloudinary.service', () => {
  test('la carpeta cuelga de CLOUDINARY_FOLDER y del id', () => {
    assert.equal(carpetaDe('estacionamientos', 'abc'), `${config.cloudinary.carpeta}/estacionamientos/abc`);
  });

  test('la firma es para un public_id nuevo de la carpeta y solo jpg, png o webp', () => {
    const carpeta = carpetaDe('vehiculos', 'v1');
    const firma = firmarSubida(carpeta);

    assert.match(firma.publicId, new RegExp(`^${carpeta}/[A-Za-z0-9_-]+$`));
    assert.notEqual(firmarSubida(carpeta).publicId, firma.publicId);
    assert.equal(firma.allowedFormats, 'jpg,png,webp');
    assert.equal(firma.cloudName, config.cloudinary.cloudName);
    assert.equal(firma.apiKey, config.cloudinary.apiKey);
    assert.equal(
      firma.signature,
      cloudinary.utils.api_sign_request(
        { allowed_formats: firma.allowedFormats, public_id: firma.publicId, timestamp: firma.timestamp },
        config.cloudinary.apiSecret,
      ),
    );
    assert.ok(!JSON.stringify(firma).includes(config.cloudinary.apiSecret));
  });

  test('verificar rechaza un public_id de otra carpeta con 400', async () => {
    const propia = carpetaDe('estacionamientos', 'e1');
    await verificar(`${propia}/foto1`, propia);
    await assert.rejects(verificar(`${carpetaDe('estacionamientos', 'e2')}/foto1`, propia), {
      statusCode: 400,
    });
    // Un prefijo parecido no alcanza: tiene que ser la carpeta entera.
    await assert.rejects(verificar(`${propia}0/foto1`, propia), { statusCode: 400 });
  });

  test('verificar rechaza rutas que salen de la carpeta aunque empiecen igual', async () => {
    const propia = carpetaDe('estacionamientos', 'e1');
    for (const truco of [
      `${propia}/../e2/foto1`,
      `${propia}/%2e%2e/e2/foto1`,
      `${propia}/sub/foto1`,
      `${propia}/`,
    ]) {
      await assert.rejects(verificar(truco, propia), { statusCode: 400 }, truco);
    }
  });

  test('la url usa formato y calidad automaticos y respeta el ancho', () => {
    const direccion = url('parkit-dev/estacionamientos/e1/foto1', { ancho: 800 });
    assert.match(direccion, /^https:\/\/res\.cloudinary\.com\//);
    assert.match(direccion, /f_auto/);
    assert.match(direccion, /q_auto/);
    assert.match(direccion, /w_800/);
    assert.match(direccion, /parkit-dev\/estacionamientos\/e1\/foto1/);
  });
});
