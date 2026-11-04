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
