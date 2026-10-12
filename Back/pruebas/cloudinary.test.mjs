// Servicio de Cloudinary: firma de subidas, carpetas y URLs. No usa la red
// (CLOUDINARY_ENABLED=false apaga la verificacion contra su API).
process.env.CLOUDINARY_ENABLED = 'false';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { v2 as cloudinary } from 'cloudinary';

import { config } from '../src/config/env.js';
import { carpetaDe, firmarSubida, url, verificar } from '../src/services/cloudinary.service.js';

describe('cloudinary.service', () => {
  test('la carpeta cuelga de CLOUDINARY_FOLDER y del id', () => {
    assert.equal(carpetaDe('estacionamientos', 'abc'), `${config.cloudinary.carpeta}/estacionamientos/abc`);
  });

  test('la firma coincide con la del SDK y no expone el secreto', () => {
    const carpeta = carpetaDe('vehiculos', 'v1');
    const firma = firmarSubida(carpeta);

    assert.equal(firma.folder, carpeta);
    assert.equal(firma.cloudName, config.cloudinary.cloudName);
    assert.equal(firma.apiKey, config.cloudinary.apiKey);
    assert.equal(
      firma.signature,
      cloudinary.utils.api_sign_request({ folder: carpeta, timestamp: firma.timestamp }, config.cloudinary.apiSecret),
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

  test('la url usa formato y calidad automaticos y respeta el ancho', () => {
    const direccion = url('parkit-dev/estacionamientos/e1/foto1', { ancho: 800 });
    assert.match(direccion, /^https:\/\/res\.cloudinary\.com\//);
    assert.match(direccion, /f_auto/);
    assert.match(direccion, /q_auto/);
    assert.match(direccion, /w_800/);
    assert.match(direccion, /parkit-dev\/estacionamientos\/e1\/foto1/);
  });
});
