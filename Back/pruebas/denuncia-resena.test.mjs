// Denuncia de reseñas: la parte calificada denuncia (una vez, con motivo), el
// administrador la desestima o la oculta, y una oculta deja de contar.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cambiarRol,
  cerrarApi,
  crearAdmin,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  levantarApi,
  motivo,
  query,
} from './ayuda.mjs';

before(() => levantarApi('denuncia-resena'));
after(() => cerrarApi());

const NOTAS = { limpieza: 5, infraestructura: 5, atencion: 5, seguridad: 5, acceso: 5 };
const notasDe = (n) => ({ limpieza: n, infraestructura: n, atencion: n, seguridad: n, acceso: n });

async function reservar(propietario, conductor, estacionamiento, cuando = franja()) {
  const vehiculo = await crearVehiculo(conductor.token);
  const { datos } = await api('POST', '/reservas', {
    token: conductor.token,
    body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...cuando },
  });
  await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, { token: propietario.token });
  return datos.reserva;
}

/** Deja la reserva usada (entro y salio) sin pasar por el QR. */
function marcarUsada(idReserva, { egresoHace = '1 hour' } = {}) {
  return query(
    `UPDATE reserva
        SET estado = 'FINALIZADA',
            inicio = now() - interval '3 hours' - $2::interval,
            fin = now() - $2::interval,
            ingreso_real = now() - interval '3 hours' - $2::interval,
            egreso_real = now() - $2::interval
      WHERE id_reserva = $1`,
    [idReserva, egresoHace],
  );
}

async function escenario() {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 3 });
  const conductor = await crearUsuario();
  return { propietario, estacionamiento, conductor };
}

let dia = 0;
/** Una reserva nueva y usada del escenario (cada una en otro dia). */
async function reservaUsada(e, opciones) {
  dia += 1;
  const reserva = await reservar(e.propietario, e.conductor, e.estacionamiento, franja('08:00', '09:00', (dia % 25) + 1));
  await marcarUsada(reserva.id_reserva, opciones);
  return reserva;
}

/** El conductor califica el estacionamiento; devuelve el id de la reseña. */
async function resenaDelConductor(e, notas = NOTAS, extra = {}) {
  const reserva = await reservaUsada(e);
  const { estado, datos } = await api('POST', `/reservas/${reserva.id_reserva}/calificacion`, {
    token: e.conductor.token,
    body: { ...notas, ...extra },
  });
  assert.equal(estado, 201);
  return datos.calificacion.id_calificacion;
}

/** El propietario califica al conductor; devuelve el id de la reseña. */
async function resenaDelPropietario(e, puntaje = 4, reserva = null) {
  const usada = reserva ?? (await reservaUsada(e));
  const { estado, datos } = await api('POST', `/reservas/${usada.id_reserva}/calificacion-conductor`, {
    token: e.propietario.token,
    body: { puntaje },
  });
  assert.equal(estado, 201);
  return datos.calificacion.id_calificacion;
}

const denunciar = (usuario, id, body = { motivo: 'OFENSIVA' }) =>
  api('POST', `/calificaciones/${id}/denuncia`, { token: usuario.token, body });

describe('denunciar una reseña', () => {
  test('el propietario denuncia una reseña de su estacionamiento', async () => {
    const e = await escenario();
    const id = await resenaDelConductor(e, NOTAS, { comentario: 'Pesimo, no vuelvo nunca mas.' });

    const { estado, datos } = await denunciar(e.propietario, id);
    assert.equal(estado, 201);
    assert.equal(datos.calificacion.denuncia_estado, 'PENDIENTE');
    assert.equal(datos.calificacion.denuncia_motivo, 'OFENSIVA');

    const { datos: detalle } = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(detalle.estacionamiento.calificaciones, 1);
  });

  test('el conductor denuncia una reseña sobre el', async () => {
    const e = await escenario();
    const id = await resenaDelPropietario(e, 1);
    assert.equal((await denunciar(e.conductor, id)).estado, 201);
  });

  test('una reseña sin comentario tambien se denuncia', async () => {
    const e = await escenario();
    const id = await resenaDelConductor(e);
    assert.equal((await denunciar(e.propietario, id, { motivo: 'FALSA' })).estado, 201);
  });

  test('403 si la reseña no es sobre vos', async () => {
    const e = await escenario();
    const delConductor = await resenaDelConductor(e);
    const delPropietario = await resenaDelPropietario(e, 3);
    const ajeno = await crearUsuario({ rol: 'PROPIETARIO' });

    for (const [usuario, id] of [
      [ajeno, delConductor],
      [e.conductor, delConductor],
      [e.propietario, delPropietario],
    ]) {
      const respuesta = await denunciar(usuario, id);
      assert.equal(respuesta.estado, 403);
      assert.match(motivo(respuesta), /sobre vos o tu estacionamiento/);
    }

    // Con los dos perfiles, como CONDUCTOR no denuncia reseñas de su propio estacionamiento.
    const dueno = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const propio = { ...e, propietario: dueno, estacionamiento: await crearEstacionamiento(dueno.token) };
    const idPropio = await resenaDelConductor(propio);
    const comoConductor = { token: await cambiarRol(dueno.token, 'CONDUCTOR') };
    assert.equal((await denunciar(comoConductor, idPropio)).estado, 403);
  });

  test('no se denuncia dos veces', async () => {
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);
    const segunda = await denunciar(e.propietario, id);
    assert.equal(segunda.estado, 409);
    assert.match(motivo(segunda), /ya fue denunciada/);
  });

  test('valida motivo y detalle', async () => {
    const e = await escenario();
    const id = await resenaDelConductor(e);
    assert.equal((await denunciar(e.propietario, id, { motivo: 'CUALQUIERA' })).estado, 400);
    assert.equal((await denunciar(e.propietario, id, {})).estado, 400);
    assert.equal((await denunciar(e.propietario, id, { motivo: 'OTRO', detalle: 'x'.repeat(501) })).estado, 400);

    const valida = await denunciar(e.propietario, id, { motivo: 'otro', detalle: ' Mal ' });
    assert.equal(valida.estado, 201);
    assert.equal(valida.datos.calificacion.denuncia_motivo, 'OTRO');
  });

  test('404 si la reseña no existe', async () => {
    const e = await escenario();
    assert.equal((await denunciar(e.propietario, crypto.randomUUID())).estado, 404);
  });
});

const moderar = (admin, id, accion) => api('PATCH', `/admin/resenas/${id}/${accion}`, { token: admin.token });

describe('moderacion del administrador', () => {
  test('la cola trae las pendientes, la mas vieja primero', async () => {
    const admin = await crearAdmin();
    const e = await escenario();
    const primera = await resenaDelConductor(e, NOTAS, { comentario: 'Primera reseña denunciada.' });
    const segunda = await resenaDelPropietario(e, 1);
    await denunciar(e.propietario, primera);
    await denunciar(e.conductor, segunda, { motivo: 'FALSA', detalle: 'No es cierto' });

    const { estado, datos } = await api('GET', '/admin/resenas', { token: admin.token });
    assert.equal(estado, 200);
    const ids = datos.resenas.map((r) => r.id_calificacion);
    assert.ok(ids.indexOf(primera) >= 0 && ids.indexOf(primera) < ids.indexOf(segunda));
    const deEstas = datos.resenas.find((r) => r.id_calificacion === primera);
    assert.equal(deEstas.autor, 'CONDUCTOR');
    assert.equal(deEstas.comentario, 'Primera reseña denunciada.');
    assert.equal(deEstas.denuncia_motivo, 'OFENSIVA');
    assert.equal(deEstas.estacionamiento, e.estacionamiento.nombre);
    assert.equal(typeof deEstas.conductor_nombre, 'string');
    assert.equal(deEstas.promedio, 5);
    const delPropietario = datos.resenas.find((r) => r.id_calificacion === segunda);
    assert.equal(delPropietario.puntaje, 1);
    assert.equal(delPropietario.denuncia_detalle, 'No es cierto');

    const desestimadas = await api('GET', '/admin/resenas?estado=DESESTIMADA', { token: admin.token });
    assert.ok(!desestimadas.datos.resenas.some((r) => r.id_calificacion === primera));
  });

  test('desestimar cierra la denuncia y no cambia la reputacion', async () => {
    const admin = await crearAdmin();
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);

    const { estado, datos } = await moderar(admin, id, 'desestimar');
    assert.equal(estado, 200);
    assert.equal(datos.resena.denuncia_estado, 'DESESTIMADA');
    const cola = await api('GET', '/admin/resenas', { token: admin.token });
    assert.ok(!cola.datos.resenas.some((r) => r.id_calificacion === id));
    const { datos: detalle } = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(detalle.estacionamiento.calificaciones, 1);
  });

  test('ocultar marca la reseña', async () => {
    const admin = await crearAdmin();
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);

    const { estado, datos } = await moderar(admin, id, 'ocultar');
    assert.equal(estado, 200);
    assert.equal(datos.resena.denuncia_estado, 'OCULTA');
    assert.equal(datos.resena.oculta, true);
  });

  test('no se modera dos veces ni algo no denunciado', async () => {
    const admin = await crearAdmin();
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);
    await moderar(admin, id, 'desestimar');

    const otraVez = await moderar(admin, id, 'ocultar');
    assert.equal(otraVez.estado, 409);
    assert.match(motivo(otraVez), /ya fue resuelta/);
    const sinDenuncia = await resenaDelConductor(e);
    assert.equal((await moderar(admin, sinDenuncia, 'ocultar')).estado, 409);
    assert.equal((await moderar(admin, crypto.randomUUID(), 'ocultar')).estado, 404);
  });

  test('dos admins a la vez: una sola moderacion', async () => {
    const [uno, otro] = [await crearAdmin(), await crearAdmin()];
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);

    const estados = (await Promise.all([moderar(uno, id, 'desestimar'), moderar(otro, id, 'ocultar')]))
      .map((r) => r.estado)
      .sort();
    assert.deepEqual(estados, [200, 409]);
  });

  test('solo el administrador', async () => {
    const e = await escenario();
    const id = await resenaDelConductor(e);
    await denunciar(e.propietario, id);
    assert.equal((await api('GET', '/admin/resenas', { token: e.propietario.token })).estado, 403);
    assert.equal((await moderar(e.propietario, id, 'ocultar')).estado, 403);
  });
});

/** `n` conductores distintos califican el estacionamiento; devuelve los ids. */
async function calificaciones(e, n, notas = NOTAS) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(await resenaDelConductor({ ...e, conductor: await crearUsuario() }, notas));
  }
  return ids;
}

async function ocultar(id, denunciante) {
  const admin = await crearAdmin();
  await denunciar(denunciante, id);
  const { estado } = await moderar(admin, id, 'ocultar');
  assert.equal(estado, 200);
}

const miReputacion = (conductor) => api('GET', '/reservas/mi-reputacion', { token: conductor.token });

describe('una reseña oculta deja de contar', () => {
  test('del estacionamiento: sale del puntaje, el promedio y las opiniones', async () => {
    const e = await escenario();
    await resenaDelConductor(e, NOTAS);
    const mala = await resenaDelConductor(e, notasDe(1), { comentario: 'Horrible, todo mal.' });
    await ocultar(mala, e.propietario);

    const { datos } = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(datos.estacionamiento.calificaciones, 1);
    assert.equal(datos.estacionamiento.calificacion_promedio, 5);
    const { datos: reputacion } = await api(
      'GET',
      `/estacionamientos/${e.estacionamiento.id_estacionamiento}/reputacion`,
      { token: e.propietario.token },
    );
    assert.ok(!reputacion.opiniones.some((o) => o.id_calificacion === mala));
  });

  test('del conductor: sale del promedio y de las reseñas', async () => {
    const e = await escenario();
    await resenaDelPropietario(e, 5);
    const mala = await resenaDelPropietario(e, 1);
    // Que las dos se vean en `resenas`: el conductor ya califico esas reservas o vencio el plazo.
    await query(`UPDATE reserva SET egreso_real = now() - interval '8 days' WHERE id_conductor = $1`, [e.conductor.id]);
    await ocultar(mala, e.conductor);

    const { datos } = await miReputacion(e.conductor);
    assert.equal(datos.reputacion.promedio, 5);
    assert.equal(datos.reputacion.cantidad, 1);
    assert.ok(!datos.reputacion.resenas.some((r) => r.id_calificacion === mala));
  });

  test('pierde el destacado si ya no llega al minimo', async () => {
    const e = await escenario();
    const ids = await calificaciones(e, 5);
    const antes = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(antes.datos.estacionamiento.destacado, true);

    await ocultar(ids[0], e.propietario);
    const despues = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}`);
    assert.equal(despues.datos.estacionamiento.destacado, false);
  });

  test('las opiniones muestran el estado de la denuncia', async () => {
    const admin = await crearAdmin();
    const e = await escenario();
    const pendiente = await resenaDelConductor(e, NOTAS, { comentario: 'Denunciada y pendiente.' });
    const desestimada = await resenaDelConductor(e, NOTAS, { comentario: 'Denunciada y desestimada.' });
    await denunciar(e.propietario, pendiente);
    await denunciar(e.propietario, desestimada);
    await moderar(admin, desestimada, 'desestimar');

    const { datos } = await api('GET', `/estacionamientos/${e.estacionamiento.id_estacionamiento}/reputacion`, {
      token: e.propietario.token,
    });
    const estado = (id) => datos.opiniones.find((o) => o.id_calificacion === id)?.denuncia_estado;
    assert.equal(estado(pendiente), 'PENDIENTE');
    assert.equal(estado(desestimada), 'DESESTIMADA');
  });
});

describe('reseñas que recibio el conductor', () => {
  test('solo las de reservas que ya califico o cuyo plazo vencio', async () => {
    const e = await escenario();
    const reservaA = await reservaUsada(e);
    const resenaA = await resenaDelPropietario(e, 4, reservaA);

    // El conductor todavia puede calificar A: no la ve, pero cuenta en el promedio.
    let { datos } = await miReputacion(e.conductor);
    assert.equal(datos.reputacion.cantidad, 1);
    assert.ok(!datos.reputacion.resenas.some((r) => r.id_calificacion === resenaA));

    await api('POST', `/reservas/${reservaA.id_reserva}/calificacion`, { token: e.conductor.token, body: NOTAS });
    ({ datos } = await miReputacion(e.conductor));
    const vista = datos.reputacion.resenas.find((r) => r.id_calificacion === resenaA);
    assert.ok(vista);
    assert.equal(vista.puntaje, 4);
    assert.equal(vista.estacionamiento, e.estacionamiento.nombre);
    assert.equal(vista.denuncia_estado, null);

    // B: calificada por el propietario y con el plazo del conductor vencido.
    const reservaB = await reservaUsada(e);
    const resenaB = await resenaDelPropietario(e, 3, reservaB);
    await query(`UPDATE reserva SET egreso_real = now() - interval '8 days' WHERE id_reserva = $1`, [reservaB.id_reserva]);
    ({ datos } = await miReputacion(e.conductor));
    assert.ok(datos.reputacion.resenas.some((r) => r.id_calificacion === resenaB));
  });
});
