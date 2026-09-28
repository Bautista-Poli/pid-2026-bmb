// ABM de estacionamientos y de sus cocheras, y la busqueda publica.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  ponerEnCurso,
  query,
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
});

describe('baja, reactivacion y eliminacion de cocheras', () => {
  async function escenario() {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 1 });
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`;
    const { datos } = await api('GET', ruta, { token: propietario.token });
    return { propietario, estacionamiento, ruta, cochera: datos.cocheras[0] };
  }

  const reservar = async (estacionamiento, cuando) => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    return api('POST', '/reservas', {
      token: conductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...cuando,
      },
    });
  };

  test('la baja cancela las reservas vigentes de la cochera', async () => {
    const { propietario, estacionamiento, ruta, cochera } = await escenario();
    const reserva = await reservar(estacionamiento, franja());
    assert.equal(reserva.estado, 201);

    const baja = await api('DELETE', `${ruta}/${cochera.id_cochera}`, { token: propietario.token });
    assert.equal(baja.estado, 200);
    assert.equal(baja.datos.cochera.activo, false);

    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [
      reserva.datos.reserva.id_reserva,
    ]);
    assert.equal(rows[0].estado, 'CANCELADA');

    const repetida = await api('DELETE', `${ruta}/${cochera.id_cochera}`, { token: propietario.token });
    assert.equal(repetida.estado, 409);
  });

  test('una cochera dada de baja se puede reactivar', async () => {
    const { propietario, ruta, cochera } = await escenario();
    await api('DELETE', `${ruta}/${cochera.id_cochera}`, { token: propietario.token });

    const reactivada = await api('POST', `${ruta}/${cochera.id_cochera}/reactivar`, {
      token: propietario.token,
    });
    assert.equal(reactivada.estado, 200);
    assert.equal(reactivada.datos.cochera.activo, true);
    assert.equal(reactivada.datos.cochera.estado_actual, 'LIBRE');

    const otraVez = await api('POST', `${ruta}/${cochera.id_cochera}/reactivar`, {
      token: propietario.token,
    });
    assert.equal(otraVez.estado, 409);
  });

  test('no se puede reactivar una cochera de un estacionamiento dado de baja', async () => {
    const { propietario, estacionamiento, ruta, cochera } = await escenario();
    await api('DELETE', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
    });

    const { estado } = await api('POST', `${ruta}/${cochera.id_cochera}/reactivar`, {
      token: propietario.token,
    });
    assert.equal(estado, 409);
  });

  test('el PATCH no permite marcarla INACTIVA', async () => {
    const { propietario, ruta, cochera } = await escenario();
    const { estado } = await api('PATCH', `${ruta}/${cochera.id_cochera}`, {
      token: propietario.token,
      body: { estado_actual: 'INACTIVA' },
    });
    assert.equal(estado, 400);
  });

  test('una cochera activa no se puede eliminar: primero hay que darla de baja', async () => {
    const { propietario, ruta, cochera } = await escenario();

    const { estado } = await api('DELETE', `${ruta}/${cochera.id_cochera}/definitiva`, {
      token: propietario.token,
    });
    assert.equal(estado, 409);
  });

  test('una cochera inactiva sin reservas se puede eliminar de verdad', async () => {
    const { propietario, ruta, cochera } = await escenario();
    await api('DELETE', `${ruta}/${cochera.id_cochera}`, { token: propietario.token });

    const { estado } = await api('DELETE', `${ruta}/${cochera.id_cochera}/definitiva`, {
      token: propietario.token,
    });
    assert.equal(estado, 204);

    const { datos } = await api('GET', ruta, { token: propietario.token });
    assert.equal(datos.cocheras.length, 0);
  });

  test('con reservas en el historial no se puede eliminar, aunque este inactiva', async () => {
    const { propietario, estacionamiento, ruta, cochera } = await escenario();
    await reservar(estacionamiento, franja());
    await api('DELETE', `${ruta}/${cochera.id_cochera}`, { token: propietario.token });

    const { estado, datos } = await api('DELETE', `${ruta}/${cochera.id_cochera}/definitiva`, {
      token: propietario.token,
    });
    assert.equal(estado, 409);
    assert.match(datos.error.message, /historial/);
  });

  test('otro propietario no puede reactivar ni eliminar', async () => {
    const { ruta, cochera } = await escenario();
    const ajeno = await nuevoPropietario();

    const reactivar = await api('POST', `${ruta}/${cochera.id_cochera}/reactivar`, { token: ajeno.token });
    assert.equal(reactivar.estado, 403);
    const eliminar = await api('DELETE', `${ruta}/${cochera.id_cochera}/definitiva`, { token: ajeno.token });
    assert.equal(eliminar.estado, 403);
  });
});

describe('busqueda con filtros', () => {
  const buscar = (estacionamiento, filtros = {}) => {
    const params = new URLSearchParams({ q: estacionamiento.nombre, ...filtros });
    return api('GET', `/estacionamientos?${params}`);
  };
  const ids = (respuesta) => respuesta.datos.estacionamientos.map((e) => e.id_estacionamiento);

  async function conConductor() {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 1 });
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const reservar = (cuando) =>
      api('POST', '/reservas', {
        token: conductor.token,
        body: {
          id_estacionamiento: estacionamiento.id_estacionamiento,
          id_vehiculo: vehiculo.id_vehiculo,
          ...cuando,
        },
      });
    return { propietario, estacionamiento, conductor, reservar };
  }

  test('filtra por zona, por precio maximo y por tipo de vehiculo', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const zona = `Zona${crypto.randomUUID().slice(0, 6)}`;
    await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { barrio_zona: zona },
    });
    const id = estacionamiento.id_estacionamiento;

    assert.deepEqual(ids(await buscar(estacionamiento, { zona })), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, { zona: 'Inexistente' })), []);

    assert.deepEqual(ids(await buscar(estacionamiento, { tarifa_max: 1000 })), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, { tarifa_max: 999 })), []);

    assert.deepEqual(ids(await buscar(estacionamiento, { tarifa_min: 1000 })), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, { tarifa_min: 1001 })), []);

    assert.deepEqual(ids(await buscar(estacionamiento, { id_tipo_vehiculo: 1 })), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, { id_tipo_vehiculo: 2 })), []);
  });

  test('filtra por el area del mapa y exige los cuatro limites', async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token);
    await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { latitud: -34.6, longitud: -58.4 },
    });
    const id = estacionamiento.id_estacionamiento;
    const area = (lat_min, lat_max, lng_min, lng_max) => ({ lat_min, lat_max, lng_min, lng_max });

    assert.deepEqual(ids(await buscar(estacionamiento, area(-34.61, -34.59, -58.41, -58.39))), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, area(-34.58, -34.57, -58.41, -58.39))), []);
    assert.deepEqual(ids(await buscar(estacionamiento, area(-34.61, -34.59, -58.38, -58.37))), []);

    assert.equal((await buscar(estacionamiento, { lat_min: -34.61, lat_max: -34.59 })).estado, 400);
    assert.equal((await buscar(estacionamiento, area(-34.59, -34.61, -58.41, -58.39))).estado, 400);
  });

  test('con franja: excluye si la unica cochera esta reservada, incluye si esta libre o cancelada', async () => {
    const { estacionamiento, conductor, reservar } = await conConductor();
    const id = estacionamiento.id_estacionamiento;
    const ocupada = franja('08:00', '10:00');
    const reserva = await reservar(ocupada);
    assert.equal(reserva.estado, 201);

    assert.deepEqual(ids(await buscar(estacionamiento, ocupada)), []);
    assert.deepEqual(ids(await buscar(estacionamiento, franja('09:00', '11:00'))), []);
    assert.deepEqual(ids(await buscar(estacionamiento, franja('10:00', '12:00'))), [id]);
    assert.deepEqual(ids(await buscar(estacionamiento, franja('08:00', '10:00', 2))), [id]);

    await api('PATCH', `/reservas/${reserva.datos.reserva.id_reserva}/cancelar`, {
      token: conductor.token,
    });
    assert.deepEqual(ids(await buscar(estacionamiento, ocupada)), [id]);
  });

  test('la franja respeta el tipo de vehiculo pedido', async () => {
    const { estacionamiento } = await conConductor();
    const cuando = franja('08:00', '10:00');
    assert.deepEqual(ids(await buscar(estacionamiento, { ...cuando, id_tipo_vehiculo: 2 })), []);
  });

  test('disponible_ahora excluye la cochera con una reserva en curso', async () => {
    const { estacionamiento, reservar } = await conConductor();
    const id = estacionamiento.id_estacionamiento;
    const reserva = await reservar(franja('08:00', '10:00'));

    assert.deepEqual(ids(await buscar(estacionamiento, { disponible_ahora: 'true' })), [id]);

    await ponerEnCurso(reserva.datos.reserva.id_reserva);
    assert.deepEqual(ids(await buscar(estacionamiento, { disponible_ahora: 'true' })), []);
    assert.deepEqual(ids(await buscar(estacionamiento, { disponible_ahora: 'false' })), [id]);
  });

  test('rechaza combinaciones invalidas de disponibilidad', async () => {
    const { estacionamiento } = await conConductor();
    const { inicio, fin } = franja('08:00', '10:00');

    for (const filtros of [
      { inicio },
      { fin },
      { inicio: fin, fin: inicio },
      { inicio, fin: inicio },
      { inicio, fin, disponible_ahora: 'true' },
      { inicio: 'ayer', fin },
    ]) {
      const respuesta = await buscar(estacionamiento, filtros);
      assert.equal(respuesta.estado, 400, JSON.stringify(filtros));
    }
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

describe('cocheras por lote', () => {
  const rutaLote = (estacionamiento) =>
    `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras/lote`;

  const nuevoEstacionamientoVacio = async () => {
    const propietario = await nuevoPropietario();
    const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 0 });
    return { propietario, estacionamiento };
  };

  test('crea la cantidad pedida con el detalle y el prefijo indicados', async () => {
    const { propietario, estacionamiento } = await nuevoEstacionamientoVacio();

    const { estado, datos } = await api('POST', rutaLote(estacionamiento), {
      token: propietario.token,
      body: {
        lotes: [{ cantidad: 3, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 1 }],
      },
    });

    assert.equal(estado, 201);
    assert.deepEqual(
      datos.cocheras.map((c) => c.identificador).sort(),
      ['PB-1', 'PB-2', 'PB-3'],
    );
    for (const cochera of datos.cocheras) {
      assert.equal(cochera.sector, 'Planta baja');
      assert.equal(cochera.estado_actual, 'LIBRE');
      assert.equal(cochera.cubierta, false);
    }
  });

  test('un segundo lote con el mismo prefijo continua la numeracion', async () => {
    const { propietario, estacionamiento } = await nuevoEstacionamientoVacio();
    const lote = { cantidad: 2, sector: 'Primer piso', prefijo: 'P1', id_tipo_vehiculo: 1 };

    await api('POST', rutaLote(estacionamiento), { token: propietario.token, body: { lotes: [lote] } });
    const { estado, datos } = await api('POST', rutaLote(estacionamiento), {
      token: propietario.token,
      body: { lotes: [{ ...lote, cantidad: 2 }] },
    });

    assert.equal(estado, 201);
    assert.deepEqual(
      datos.cocheras.map((c) => c.identificador).sort(),
      ['P1-3', 'P1-4'],
    );
  });

  test('acepta varios lotes en un mismo pedido, incluso con el mismo prefijo', async () => {
    const { propietario, estacionamiento } = await nuevoEstacionamientoVacio();

    const { estado, datos } = await api('POST', rutaLote(estacionamiento), {
      token: propietario.token,
      body: {
        lotes: [
          { cantidad: 2, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 1 },
          { cantidad: 2, sector: 'Primer piso', prefijo: 'P1', id_tipo_vehiculo: 2, cubierta: true },
          { cantidad: 1, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 2 },
        ],
      },
    });

    assert.equal(estado, 201);
    assert.deepEqual(
      datos.cocheras.map((c) => c.identificador).sort(),
      ['P1-1', 'P1-2', 'PB-1', 'PB-2', 'PB-3'],
    );
    assert.ok(datos.cocheras.filter((c) => c.sector === 'Primer piso').every((c) => c.cubierta));

    const listado = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`);
    assert.equal(listado.datos.cocheras.length, 5);
  });

  test('rechaza cantidades y prefijos invalidos', async () => {
    const { propietario, estacionamiento } = await nuevoEstacionamientoVacio();
    const valido = { cantidad: 2, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 1 };
    const invalidos = [
      { ...valido, cantidad: 0 },
      { ...valido, cantidad: 201 },
      { ...valido, prefijo: '' },
      { ...valido, prefijo: 'con espacio' },
      { ...valido, prefijo: 'PREFIJO-MUY-LARGO' },
      { ...valido, sector: '' },
    ];

    for (const lote of invalidos) {
      const { estado } = await api('POST', rutaLote(estacionamiento), {
        token: propietario.token,
        body: { lotes: [lote] },
      });
      assert.equal(estado, 400, JSON.stringify(lote));
    }

    const vacio = await api('POST', rutaLote(estacionamiento), {
      token: propietario.token,
      body: { lotes: [] },
    });
    assert.equal(vacio.estado, 400);
  });

  test('es atomico: un tipo de vehiculo inexistente no crea ninguna cochera', async () => {
    const { propietario, estacionamiento } = await nuevoEstacionamientoVacio();

    const { estado } = await api('POST', rutaLote(estacionamiento), {
      token: propietario.token,
      body: {
        lotes: [
          { cantidad: 2, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 1 },
          { cantidad: 2, sector: 'Subsuelo', prefijo: 'S', id_tipo_vehiculo: 9999 },
        ],
      },
    });
    assert.equal(estado, 400);

    const listado = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`);
    assert.equal(listado.datos.cocheras.length, 0);
  });

  test('solo el propietario del estacionamiento puede cargar lotes', async () => {
    const { estacionamiento } = await nuevoEstacionamientoVacio();
    const otro = await nuevoPropietario();
    const conductor = await crearUsuario();
    const body = { lotes: [{ cantidad: 1, sector: 'Planta baja', prefijo: 'PB', id_tipo_vehiculo: 1 }] };

    const ajeno = await api('POST', rutaLote(estacionamiento), { token: otro.token, body });
    assert.ok([403, 404].includes(ajeno.estado), `estado ${ajeno.estado}`);

    const comoConductor = await api('POST', rutaLote(estacionamiento), { token: conductor.token, body });
    assert.equal(comoConductor.estado, 403);
  });
});
