// Calificaciones: al terminar una reserva el conductor califica el
// estacionamiento y el propietario al conductor.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cambiarRol,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';

before(() => levantarApi('calificacion'));
after(() => cerrarApi());

// Cada reserva va en un dia distinto: asi se reusa la misma cochera sin solaparse.
let diasAdelante = 0;

/** Reserva del conductor en el estacionamiento, llevada al `estado` y terminada hace `diasAtras` dias. */
async function reservaTerminada(
  { conductor, vehiculo, estacionamiento },
  { estado = 'FINALIZADA', diasAtras = 1, conEgreso = true } = {},
) {
  diasAdelante += 1;
  const { datos, estado: http } = await api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...franja('08:00', '10:00', diasAdelante),
    },
  });
  assert.equal(http, 201, motivo({ datos }));
  const id = datos.reserva.id_reserva;
  const ingresoYEgreso = estado === 'FINALIZADA' && conEgreso;
  await query(
    `UPDATE reserva
        SET estado = $2,
            inicio = now() - make_interval(days => $3) - interval '2 hours',
            fin    = now() - make_interval(days => $3),
            ingreso_real = CASE WHEN $4 THEN now() - make_interval(days => $3) - interval '2 hours' END,
            egreso_real  = CASE WHEN $4 THEN now() - make_interval(days => $3) END
      WHERE id_reserva = $1`,
    [id, estado, diasAtras, ingresoYEgreso],
  );
  return id;
}

/** Propietario con un estacionamiento y un conductor con vehiculo. */
async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 1 });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  return { propietario, estacionamiento, conductor, vehiculo };
}

const calificar = (token, idReserva, body) =>
  api('POST', `/reservas/${idReserva}/calificacion`, { token, body });

describe('calificar una reserva', () => {
  let e;
  before(async () => {
    e = await escenario();
  });

  test('el conductor califica una FINALIZADA', async () => {
    const id = await reservaTerminada(e);
    const r = await calificar(e.conductor.token, id, { puntaje: 4, comentario: 'Muy bien' });
    assert.equal(r.estado, 201, motivo(r));
    assert.equal(r.datos.calificacion.autor, 'CONDUCTOR');
    assert.equal(r.datos.calificacion.puntaje, 4);
    assert.equal(r.datos.calificacion.comentario, 'Muy bien');
  });

  test('el propietario califica al conductor de una FINALIZADA', async () => {
    const id = await reservaTerminada(e);
    const r = await calificar(e.propietario.token, id, { puntaje: 5 });
    assert.equal(r.estado, 201, motivo(r));
    assert.equal(r.datos.calificacion.autor, 'PROPIETARIO');
    assert.equal(r.datos.calificacion.comentario, null);
  });

  test('un Ausente lo califica el propietario, no el conductor', async () => {
    const id = await reservaTerminada(e, { estado: 'NO_SHOW' });
    const delConductor = await calificar(e.conductor.token, id, { puntaje: 1 });
    assert.equal(delConductor.estado, 409);
    assert.equal(motivo(delConductor), 'Esta reserva no se puede calificar');
    const delPropietario = await calificar(e.propietario.token, id, { puntaje: 2 });
    assert.equal(delPropietario.estado, 201, motivo(delPropietario));
  });

  test('CONFIRMADA y CANCELADA no se califican', async () => {
    for (const estado of ['CONFIRMADA', 'CANCELADA']) {
      const id = await reservaTerminada(e, { estado });
      const r = await calificar(e.conductor.token, id, { puntaje: 3 });
      assert.equal(r.estado, 409, estado);
    }
  });

  test('una sola por lado, aunque lleguen dos a la vez', async () => {
    const id = await reservaTerminada(e);
    const [a, b] = await Promise.all([
      calificar(e.conductor.token, id, { puntaje: 5 }),
      calificar(e.conductor.token, id, { puntaje: 4 }),
    ]);
    assert.deepEqual([a.estado, b.estado].sort(), [201, 409]);
    const otra = await calificar(e.conductor.token, id, { puntaje: 3 });
    assert.equal(otra.estado, 409);
    assert.equal(motivo(otra), 'Ya calificaste esta reserva');
  });

  test('pasados 14 dias ya no se califica', async () => {
    const id = await reservaTerminada(e, { diasAtras: 15 });
    const r = await calificar(e.conductor.token, id, { puntaje: 3 });
    assert.equal(r.estado, 409);
    assert.equal(motivo(r), 'Paso el plazo para calificar');
  });

  test('sin egreso registrado el plazo corre desde el fin', async () => {
    const id = await reservaTerminada(e, { diasAtras: 13, conEgreso: false });
    const r = await calificar(e.conductor.token, id, { puntaje: 3 });
    assert.equal(r.estado, 201, motivo(r));
  });

  test('otro conductor u otro propietario no la encuentran', async () => {
    const id = await reservaTerminada(e);
    const otroConductor = await crearUsuario();
    const otroPropietario = await crearUsuario({ rol: 'PROPIETARIO' });
    assert.equal((await calificar(otroConductor.token, id, { puntaje: 3 })).estado, 404);
    assert.equal((await calificar(otroPropietario.token, id, { puntaje: 3 })).estado, 404);
  });

  test('con dos perfiles, el autor sale del perfil activo', async () => {
    const doble = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const comoConductor = await cambiarRol(doble.token, 'CONDUCTOR');
    const vehiculo = await crearVehiculo(comoConductor);
    const id = await reservaTerminada({
      conductor: { token: comoConductor },
      vehiculo,
      estacionamiento: e.estacionamiento,
    });
    const comoPropietario = await cambiarRol(comoConductor, 'PROPIETARIO');
    assert.equal((await calificar(comoPropietario, id, { puntaje: 3 })).estado, 404);
    const r = await calificar(comoConductor, id, { puntaje: 3 });
    assert.equal(r.estado, 201, motivo(r));
    assert.equal(r.datos.calificacion.autor, 'CONDUCTOR');
  });

  test('valida puntaje y comentario', async () => {
    const id = await reservaTerminada(e);
    for (const puntaje of [0, 6, 3.5, undefined]) {
      const r = await calificar(e.conductor.token, id, { puntaje });
      assert.equal(r.estado, 400, `puntaje ${puntaje}`);
    }
    const largo = await calificar(e.conductor.token, id, { puntaje: 3, comentario: 'x'.repeat(501) });
    assert.equal(largo.estado, 400);
    const vacio = await calificar(e.conductor.token, id, { puntaje: 3, comentario: '   ' });
    assert.equal(vacio.estado, 201, motivo(vacio));
    assert.equal(vacio.datos.calificacion.comentario, null);
  });

  test('las reservas avisan quien califico, hasta cuando y la reputacion del conductor', async () => {
    const id = await reservaTerminada(e);
    await calificar(e.conductor.token, id, { puntaje: 4 });
    await calificar(e.propietario.token, id, { puntaje: 2 });

    const { datos } = await api('GET', '/reservas', { token: e.conductor.token });
    const reserva = datos.reservas.find((r) => r.id_reserva === id);
    assert.equal(reserva.califico_conductor, true);
    assert.equal(reserva.califico_propietario, true);
    assert.ok(reserva.calificable_hasta);

    const recibidas = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}/reservas`, {
      token: e.propietario.token,
    });
    const vista = recibidas.datos.reservas.find((r) => r.id_reserva === id);
    assert.ok(vista.conductor_cantidad_calificaciones >= 1);
    assert.equal(typeof vista.conductor_calificacion_promedio, 'number');
  });
});

/**
 * Estacionamiento nuevo con una calificacion de conductor por cada puntaje.
 * Las reservas se copian por SQL de una hecha por la API (son muchas).
 */
async function estacionamientoCalificado(puntajes) {
  const e = await escenario();
  const plantilla = await reservaTerminada(e);
  for (const puntaje of puntajes) {
    const { rows } = await query(
      `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, precio_total)
       SELECT id_conductor, id_vehiculo, id_cochera, inicio, fin, 'FINALIZADA', precio_total
         FROM reserva WHERE id_reserva = $1
       RETURNING id_reserva, id_conductor`,
      [plantilla],
    );
    await query(
      `INSERT INTO calificacion (id_reserva, autor, id_estacionamiento, id_conductor, puntaje)
       VALUES ($1, 'CONDUCTOR', $2, $3, $4)`,
      [rows[0].id_reserva, e.estacionamiento.id_estacionamiento, rows[0].id_conductor, puntaje],
    );
  }
  return e;
}

/** El estacionamiento tal como lo devuelve la busqueda (filtrando por su nombre, que es unico). */
async function enLaBusqueda(estacionamiento, extra = '') {
  const { estado, datos } = await api(
    'GET',
    `/estacionamientos?q=${encodeURIComponent(estacionamiento.nombre)}${extra}`,
  );
  assert.equal(estado, 200, motivo({ datos }));
  return datos.estacionamientos.find((x) => x.id_estacionamiento === estacionamiento.id_estacionamiento);
}

describe('reputacion del estacionamiento', () => {
  test('sin calificaciones: sin promedio, cantidad 0 y el puntaje general para ordenar', async () => {
    const { estacionamiento } = await escenario();
    const encontrado = await enLaBusqueda(estacionamiento);
    assert.equal(encontrado.calificacion_promedio, null);
    assert.equal(encontrado.cantidad_calificaciones, 0);
    assert.ok(encontrado.puntaje_orden >= 1 && encontrado.puntaje_orden <= 5);
  });

  test('promedio y cantidad; las del propietario no cuentan', async () => {
    const e = await estacionamientoCalificado([5, 3]);
    const id = await reservaTerminada(e);
    await calificar(e.propietario.token, id, { puntaje: 1 });

    const encontrado = await enLaBusqueda(e.estacionamiento);
    assert.equal(encontrado.calificacion_promedio, 4);
    assert.equal(encontrado.cantidad_calificaciones, 2);

    const detalle = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(detalle.datos.estacionamiento.calificacion_promedio, 4);
  });

  test('una sola 5 ordena por debajo de diez 5', async () => {
    const una = await enLaBusqueda((await estacionamientoCalificado([5])).estacionamiento);
    const diez = await enLaBusqueda((await estacionamientoCalificado(Array(10).fill(5))).estacionamiento);
    assert.ok(una.puntaje_orden < diez.puntaje_orden);
  });

  test('el filtro usa el promedio que se ve: 3.96 se muestra 4.0 y pasa el 4+', async () => {
    const { estacionamiento } = await estacionamientoCalificado([...Array(24).fill(4), 3]);
    const encontrado = await enLaBusqueda(estacionamiento, '&calificacion_min=4');
    assert.ok(encontrado, 'deberia pasar el filtro 4+');
    assert.equal(encontrado.calificacion_promedio, 4);
  });

  test('el minimo deja afuera a los de menor promedio y a los nuevos', async () => {
    const { estacionamiento: conCuatro } = await estacionamientoCalificado([4]);
    const { estacionamiento: nuevo } = await escenario();
    assert.equal(await enLaBusqueda(conCuatro, '&calificacion_min=4.5'), undefined);
    assert.equal(await enLaBusqueda(nuevo, '&calificacion_min=3'), undefined);
    const fuera = await api('GET', '/estacionamientos?calificacion_min=6');
    assert.equal(fuera.estado, 400);
  });
});
