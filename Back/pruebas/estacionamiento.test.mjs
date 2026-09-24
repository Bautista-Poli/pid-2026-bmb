// ABM de estacionamientos y de sus cocheras, y la busqueda publica.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  levantarApi,
  motivo,
} from './ayuda.mjs';

before(() => levantarApi('estacionamiento'));
after(() => cerrarApi());

const nuevoPropietario = () => crearUsuario({ rol: 'PROPIETARIO' });

describe('alta y consulta', () => {
  test('se crea con horarios y aparece en los del propietario', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 2 });

    assert.equal(estacionamiento.direccion, 'Av. Prueba 100');

    const mios = await api('GET', '/estacionamientos/mios', { token: propietario.token });
    const mio = mios.datos.estacionamientos.find(
      (e) => e.id_estacionamiento === estacionamiento.id_estacionamiento,
    );
    assert.ok(mio);
    assert.equal(mio.cocheras_activas, 2);
    assert.equal(mio.horarios.length, 7);
  });

  test('la busqueda publica lo encuentra por nombre', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado, datos } = await api(
      'GET',
      `/estacionamientos?q=${encodeURIComponent(estacionamiento.nombre)}`,
    );
    assert.equal(estado, 200);
    assert.equal(datos.estacionamientos.length, 1);
    assert.equal(datos.estacionamientos[0].id_estacionamiento, estacionamiento.id_estacionamiento);
  });

  test('un conductor no puede crear estacionamientos', async () => {
    const conductor = await crearUsuario();
    const { estado } = await api('POST', '/estacionamientos', {
      token: conductor.token,
      body: { nombre: 'Prueba', calle: 'A', numero: '1', ciudad: 'CABA', provincia: 'BA' },
    });
    assert.equal(estado, 403);
  });
});

describe('edicion', () => {
  test('cambia datos y rearma la direccion', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado, datos } = await api(
      'PATCH',
      `/estacionamientos/${estacionamiento.id_estacionamiento}`,
      { token: propietario.token, body: { nombre: 'Editado', tarifa_hora: 1500, numero: '250' } },
    );

    assert.equal(estado, 200);
    assert.equal(datos.estacionamiento.nombre, 'Editado');
    assert.equal(datos.estacionamiento.tarifa_hora, 1500);
    assert.equal(datos.estacionamiento.direccion, 'Av. Prueba 250');
  });

  test('los horarios que llegan reemplazan a los cargados', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { datos } = await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { horarios: [{ dia_semana: 5, hora_apertura: '09:00', hora_cierre: '18:00' }] },
    });

    assert.equal(datos.estacionamiento.horarios.length, 1);
    assert.equal(datos.estacionamiento.horarios[0].dia_semana, 5);
  });

  test('un null vacia un dato opcional', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { telefono_contacto: '1144556677' },
    });

    const { datos } = await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { telefono_contacto: null },
    });
    assert.equal(datos.estacionamiento.telefono_contacto, null);
  });

  test('rechaza el body vacio y los valores invalidos', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;

    const vacio = await api('PATCH', ruta, { token: propietario.token, body: {} });
    assert.equal(vacio.estado, 400);

    const negativa = await api('PATCH', ruta, {
      token: propietario.token,
      body: { tarifa_hora: -5 },
    });
    assert.equal(negativa.estado, 400);
  });

  test('otro propietario no puede editarlo ni darlo de baja', async () => {
    const propietario = await nuevoPropietario();
    const ajeno = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;

    const edicion = await api('PATCH', ruta, { token: ajeno.token, body: { nombre: 'Robado' } });
    assert.equal(edicion.estado, 403);

    const baja = await api('DELETE', ruta, { token: ajeno.token });
    assert.equal(baja.estado, 403);
  });
});

describe('publicacion y baja', () => {
  test('despublicar lo saca de la busqueda y publicar lo devuelve', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;
    const buscar = () => api('GET', `/estacionamientos?q=${encodeURIComponent(estacionamiento.nombre)}`);

    await api('PATCH', ruta, { token: propietario.token, body: { publicado: false } });
    assert.equal((await buscar()).datos.estacionamientos.length, 0);

    // Despublicado sigue estando para su duenio.
    const mios = await api('GET', '/estacionamientos/mios', { token: propietario.token });
    assert.ok(
      mios.datos.estacionamientos.some(
        (e) => e.id_estacionamiento === estacionamiento.id_estacionamiento,
      ),
    );

    await api('PATCH', ruta, { token: propietario.token, body: { publicado: true } });
    assert.equal((await buscar()).datos.estacionamientos.length, 1);
  });

  test('la baja desactiva las cocheras y bloquea la edicion', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 2 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;

    const baja = await api('DELETE', ruta, { token: propietario.token });
    assert.equal(baja.estado, 200);
    assert.equal(baja.datos.estacionamiento.activo, false);
    assert.equal(baja.datos.estacionamiento.publicado, false);

    const cocheras = await api('GET', `${ruta}/cocheras`);
    assert.ok(cocheras.datos.cocheras.every((c) => !c.activo && c.estado_actual === 'INACTIVA'));

    const repetida = await api('DELETE', ruta, { token: propietario.token });
    assert.equal(repetida.estado, 409);

    const edicion = await api('PATCH', ruta, {
      token: propietario.token,
      body: { publicado: true },
    });
    assert.equal(edicion.estado, 409);
    assert.match(motivo(edicion), /baja/i);
  });

  test('un id inexistente responde 404', async () => {
    const propietario = await nuevoPropietario();
    const { estado } = await api('DELETE', `/estacionamientos/${crypto.randomUUID()}`, {
      token: propietario.token,
    });
    assert.equal(estado, 404);
  });
});

describe('cocheras', () => {
  test('alta, edicion y baja logica', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`;

    const alta = await api('POST', ruta, {
      token: propietario.token,
      body: { identificador: 'A-01', id_tipo_vehiculo: 1, sector: 'A', cubierta: true },
    });
    assert.equal(alta.estado, 201);
    assert.equal(alta.datos.cochera.estado_actual, 'LIBRE');

    const repetida = await api('POST', ruta, {
      token: propietario.token,
      body: { identificador: 'A-01', id_tipo_vehiculo: 1 },
    });
    assert.equal(repetida.estado, 409);

    const cambio = await api('PATCH', `${ruta}/${alta.datos.cochera.id_cochera}`, {
      token: propietario.token,
      body: { estado_actual: 'OCUPADA' },
    });
    assert.equal(cambio.datos.cochera.estado_actual, 'OCUPADA');

    const baja = await api('DELETE', `${ruta}/${alta.datos.cochera.id_cochera}`, {
      token: propietario.token,
    });
    assert.equal(baja.datos.cochera.activo, false);
    assert.equal(baja.datos.cochera.estado_actual, 'INACTIVA');
  });

  // El identificador es texto, asi que el listado se ordena por su parte
  // numerica y no lexicograficamente (si no, la 10 quedaria antes que la 2).
  test('el listado ordena las cocheras por numero', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`;

    for (const identificador of ['10', '2', '1']) {
      await api('POST', ruta, { token: propietario.token, body: { identificador, id_tipo_vehiculo: 1 } });
    }

    const { datos } = await api('GET', ruta, { token: propietario.token });
    assert.deepEqual(datos.cocheras.map((c) => c.identificador), ['1', '2', '10']);
  });

  test('el alta en lote numera a partir de la siguiente cochera libre', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`;

    await api('POST', ruta, { token: propietario.token, body: { identificador: '3', id_tipo_vehiculo: 1 } });

    const lote = await api('POST', `${ruta}/lote`, {
      token: propietario.token,
      body: { cantidad: 3, sector: 'Planta baja', id_tipo_vehiculo: 1 },
    });
    assert.equal(lote.estado, 201);
    assert.deepEqual(lote.datos.cocheras.map((c) => c.identificador), ['4', '5', '6']);
    assert.ok(lote.datos.cocheras.every((c) => c.sector === 'Planta baja'));

    const { datos } = await api('GET', ruta, { token: propietario.token });
    assert.deepEqual(datos.cocheras.map((c) => c.identificador), ['3', '4', '5', '6']);
  });

  test('el alta en lote pide sector y una cantidad de al menos 2', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras/lote`;

    const sinSector = await api('POST', ruta, {
      token: propietario.token,
      body: { cantidad: 5, id_tipo_vehiculo: 1 },
    });
    assert.equal(sinSector.estado, 400);

    const cantidadInvalida = await api('POST', ruta, {
      token: propietario.token,
      body: { cantidad: 1, sector: 'Fondo', id_tipo_vehiculo: 1 },
    });
    assert.equal(cantidadInvalida.estado, 400);
  });
});

// PNG de 1x1 valido: alcanza para probar la firma de bytes sin sumar un archivo binario al repo.
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('foto del estacionamiento', () => {
  test('se sube, se lee y se borra', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/foto`;

    const antes = await api('GET', ruta);
    assert.equal(antes.estado, 404);

    const subida = await api('PUT', ruta, {
      token: propietario.token,
      raw: PNG_MINIMO,
      contentType: 'image/png',
    });
    assert.equal(subida.estado, 200);

    const leida = await api('GET', ruta);
    assert.equal(leida.estado, 200);
    assert.equal(leida.headers.get('content-type'), 'image/png');
    assert.ok(leida.datos.equals(PNG_MINIMO));

    const borrada = await api('DELETE', ruta, { token: propietario.token });
    assert.equal(borrada.estado, 204);

    const despues = await api('GET', ruta);
    assert.equal(despues.estado, 404);
  });

  test('rechaza un archivo que no es una imagen valida', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/foto`;

    const { estado } = await api('PUT', ruta, {
      token: propietario.token,
      raw: Buffer.from('no es una imagen'),
      contentType: 'image/png',
    });
    assert.equal(estado, 400);
  });

  test('un propietario ajeno no puede subir ni borrar la foto', async () => {
    const propietario = await nuevoPropietario();
    const otro = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/foto`;

    const subida = await api('PUT', ruta, { token: otro.token, raw: PNG_MINIMO, contentType: 'image/png' });
    assert.equal(subida.estado, 403);

    const borrada = await api('DELETE', ruta, { token: otro.token });
    assert.equal(borrada.estado, 403);
  });
});

describe('tarifas por modalidad', () => {
  const rutaDe = (estacionamiento) => `/estacionamientos/${estacionamiento.id_estacionamiento}`;

  test('se puede ofrecer solo estadia y jornada', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_estadia: 5000, tarifa_jornada: 8000 },
    });

    assert.equal(estacionamiento.tarifa_hora, null);
    assert.equal(estacionamiento.tarifa_estadia, 5000);
    assert.equal(estacionamiento.tarifa_jornada, 8000);
  });

  test('crear sin ninguna tarifa devuelve 400', async () => {
    const propietario = await nuevoPropietario();
    const { estado, datos } = await api('POST', '/estacionamientos', {
      token: propietario.token,
      body: {
        nombre: 'Sin tarifas',
        calle: 'Av. Prueba',
        numero: '1',
        ciudad: 'CABA',
        provincia: 'Buenos Aires',
      },
    });

    assert.equal(estado, 400);
    assert.match(JSON.stringify(datos), /tarifa_hora/);
  });

  test('una tarifa en 0 es valida (gratis)', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 0 },
    });

    assert.equal(estacionamiento.tarifa_hora, 0);
  });

  test('una tarifa negativa devuelve 400', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { estado } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_jornada: -1 },
    });
    assert.equal(estado, 400);
  });

  test('PATCH con null borra una modalidad y conserva las demas', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 1000, tarifa_estadia: 5000 },
    });

    const { estado, datos } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_estadia: null },
    });

    assert.equal(estado, 200);
    assert.equal(datos.estacionamiento.tarifa_estadia, null);
    assert.equal(datos.estacionamiento.tarifa_hora, 1000);
  });

  test('PATCH que dejaria al estacionamiento sin tarifas devuelve 400 y no cambia nada', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      tarifas: { tarifa_hora: 1000 },
    });

    const { estado } = await api('PATCH', rutaDe(estacionamiento), {
      token: propietario.token,
      body: { tarifa_hora: null },
    });
    assert.equal(estado, 400);

    const actual = await api('GET', rutaDe(estacionamiento), { token: propietario.token });
    assert.equal(actual.datos.estacionamiento.tarifa_hora, 1000);
  });
});
