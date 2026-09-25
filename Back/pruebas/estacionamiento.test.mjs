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
