// Reglas de negocio de deuda.md (D-01 a D-34) y la auto-reserva: lo que antes
// se podia hacer y no tendria que poderse.
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
import { motivoFueraDeHorario } from '../src/utils/horario.js';

before(() => levantarApi('reglas'));
after(() => cerrarApi());

/** Propietario con estacionamiento de `cocheras` cocheras, y un conductor con vehiculo. */
async function escenario({ cocheras = 1 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}`;
  return { propietario, estacionamiento, conductor, vehiculo, ruta };
}

async function reservar(conductor, vehiculo, estacionamiento, rango = franja()) {
  return api('POST', '/reservas', {
    token: conductor.token,
    body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...rango },
  });
}

/** Deja la reserva con el auto adentro; con `excedida`, pasada de su fin. */
function ponerActiva(idReserva, { excedida = false } = {}) {
  return query(
    `UPDATE reserva SET estado = 'ACTIVA', inicio = now() - interval '2 hours', ingreso_real = now() - interval '2 hours',
            fin = now() + ${excedida ? "interval '-10 minutes'" : "interval '1 hour'"}
      WHERE id_reserva = $1`,
    [idReserva],
  );
}

describe('un propietario no reserva en lo suyo', () => {
  test('ni por estacionamiento ni por cochera puntual', async () => {
    const usuario = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const estacionamiento = await crearEstacionamiento(usuario.token);
    const { datos } = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`);
    const idCochera = datos.cocheras[0].id_cochera;

    usuario.token = await cambiarRol(usuario.token, 'CONDUCTOR');
    const vehiculo = await crearVehiculo(usuario.token);

    const porEstacionamiento = await reservar(usuario, vehiculo, estacionamiento);
    assert.equal(porEstacionamiento.estado, 409);
    assert.match(motivo(porEstacionamiento), /propio/);

    const porCochera = await api('POST', '/reservas', {
      token: usuario.token,
      body: { id_cochera: idCochera, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
    });
    assert.equal(porCochera.estado, 409);
  });

  test('ni compra un abono de su estacionamiento', async () => {
    const usuario = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const estacionamiento = await crearEstacionamiento(usuario.token);
    const plan = await api('POST', `/estacionamientos/${estacionamiento.id_estacionamiento}/planes-abono`, {
      token: usuario.token,
      body: { turno: 'MANANA', cupos: 2, precio: 30000 },
    });

    usuario.token = await cambiarRol(usuario.token, 'CONDUCTOR');
    const compra = await api('POST', '/abonos', { token: usuario.token, body: { id_plan: plan.datos.plan.id_plan } });
    assert.equal(compra.estado, 409);
    assert.match(motivo(compra), /propio/);
  });
});

describe('bajas con un vehiculo adentro (D-01)', () => {
  test('ni la cochera ni el estacionamiento se dan de baja', async () => {
    const { propietario, estacionamiento, conductor, vehiculo, ruta } = await escenario();
    const { datos } = await reservar(conductor, vehiculo, estacionamiento);
    await ponerActiva(datos.reserva.id_reserva, { excedida: true });

    const bajaCochera = await api('DELETE', `${ruta}/cocheras/${datos.reserva.id_cochera}`, {
      token: propietario.token,
    });
    assert.equal(bajaCochera.estado, 409);
    const bajaEstacionamiento = await api('DELETE', ruta, { token: propietario.token });
    assert.equal(bajaEstacionamiento.estado, 409);

    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [datos.reserva.id_reserva]);
    assert.equal(rows[0].estado, 'ACTIVA');
  });

  test('el conductor no da de baja su cuenta con el auto estacionado', async () => {
    const { conductor, vehiculo, estacionamiento } = await escenario();
    const { datos } = await reservar(conductor, vehiculo, estacionamiento);
    await ponerActiva(datos.reserva.id_reserva);

    const baja = await api('DELETE', '/auth/me', { token: conductor.token });
    assert.equal(baja.estado, 409);
  });
});

describe('baja del estacionamiento con abonos vigentes (D-06, D-07)', () => {
  test('cancela el abono, devuelve lo no usado y apaga los planes', async () => {
    const { propietario, estacionamiento, conductor, ruta } = await escenario();
    const plan = await api('POST', `${ruta}/planes-abono`, {
      token: propietario.token,
      body: { turno: 'MANANA', cupos: 2, precio: 30000 },
    });
    const compra = await api('POST', '/abonos', { token: conductor.token, body: { id_plan: plan.datos.plan.id_plan } });
    const idAbono = compra.datos.abono.id_abono;

    assert.equal((await api('DELETE', ruta, { token: propietario.token })).estado, 200);

    const { rows: abono } = await query('SELECT estado FROM abono WHERE id_abono = $1', [idAbono]);
    assert.equal(abono[0].estado, 'CANCELADO');
    const { rows: devuelto } = await query('SELECT monto, id_incidencia FROM devolucion WHERE id_abono = $1', [
      idAbono,
    ]);
    assert.equal(Number(devuelto[0].monto), 30000);
    assert.equal(devuelto[0].id_incidencia, null);
    const { rows: planes } = await query('SELECT activo FROM plan_abono WHERE id_estacionamiento = $1', [
      estacionamiento.id_estacionamiento,
    ]);
    assert.ok(planes.every((p) => !p.activo));
  });

  test('la baja de la cuenta deja el estacionamiento como una baja comun', async () => {
    const { propietario, estacionamiento } = await escenario();
    assert.equal((await api('DELETE', '/auth/me', { token: propietario.token })).estado, 204);

    const { rows } = await query(
      `SELECT e.activo, e.publicado, bool_or(c.activo) AS alguna_activa
         FROM estacionamiento e JOIN cochera c ON c.id_estacionamiento = e.id_estacionamiento
        WHERE e.id_estacionamiento = $1 GROUP BY e.activo, e.publicado`,
      [estacionamiento.id_estacionamiento],
    );
    assert.deepEqual(rows[0], { activo: false, publicado: false, alguna_activa: false });
  });
});

describe('auto excedido (D-02, D-04)', () => {
  test('el siguiente no ingresa mientras el excedido sigue adentro', async () => {
    const { propietario, estacionamiento, conductor, vehiculo } = await escenario();
    const primera = await reservar(conductor, vehiculo, estacionamiento, franja('08:00', '10:00'));

    const otro = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otro.token);
    const segunda = await reservar(otro, otroVehiculo, estacionamiento, franja('10:00', '12:00'));

    await ponerActiva(primera.datos.reserva.id_reserva, { excedida: true });
    await query(
      `UPDATE reserva SET estado = 'CONFIRMADA', inicio = now() - interval '5 minutes', fin = now() + interval '55 minutes'
        WHERE id_reserva = $1`,
      [segunda.datos.reserva.id_reserva],
    );

    const ingreso = await api('POST', '/reservas/acceso', {
      token: propietario.token,
      body: { codigo: segunda.datos.reserva.codigo_acceso },
    });
    assert.equal(ingreso.estado, 409);
    assert.match(motivo(ingreso), /sigue ocupada/);
  });

  test('el vehiculo excedido no reserva en otro lado', async () => {
    const { estacionamiento, conductor, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, vehiculo, estacionamiento);
    await ponerActiva(datos.reserva.id_reserva, { excedida: true });

    const otro = await escenario();
    const segunda = await reservar(conductor, vehiculo, otro.estacionamiento);
    assert.equal(segunda.estado, 409);
    assert.match(motivo(segunda), /vehiculo ya tiene una reserva/);
  });
});

describe('ciclo de la reserva', () => {
  test('una PENDIENTE que ya empezo no se confirma (D-11)', async () => {
    const { propietario, estacionamiento, conductor, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, vehiculo, estacionamiento);
    await query(
      `UPDATE reserva SET inicio = now() - interval '1 minute', fin = now() + interval '1 hour' WHERE id_reserva = $1`,
      [datos.reserva.id_reserva],
    );

    const confirmacion = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/confirmar`, {
      token: propietario.token,
    });
    assert.equal(confirmacion.estado, 409);
    assert.match(motivo(confirmacion), /expirada/);
  });

  test('el bloqueo con hasta no toca lo que empieza despues (D-05)', async () => {
    const { propietario, estacionamiento, conductor, vehiculo, ruta } = await escenario();
    const { datos } = await reservar(conductor, vehiculo, estacionamiento, franja('08:00', '10:00', 2));

    const bloqueo = await api('POST', `${ruta}/cocheras/${datos.reserva.id_cochera}/bloquear`, {
      token: propietario.token,
      body: { motivo: 'Pintura', hasta: new Date(Date.now() + 3_600_000).toISOString() },
    });
    assert.equal(bloqueo.estado, 200);
    assert.equal(bloqueo.datos.canceladas, 0);

    const { rows } = await query('SELECT estado FROM reserva WHERE id_reserva = $1', [datos.reserva.id_reserva]);
    assert.equal(rows[0].estado, 'PENDIENTE');
  });

  test('una franja que termina a la medianoche entra en un horario hasta las 23:59 (D-13)', () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
      dia_semana,
      hora_apertura: '00:00:00',
      hora_cierre: '23:59:00',
    }));
    const { inicio } = franja('18:00', '20:00');
    const fin = new Date(new Date(inicio).getTime() + 6 * 3_600_000);
    assert.equal(motivoFueraDeHorario(horarios, new Date(inicio), fin), null);
  });
});

describe('vehiculos', () => {
  test('no se da de baja con reservas vigentes (D-16)', async () => {
    const { estacionamiento, conductor, vehiculo } = await escenario();
    await reservar(conductor, vehiculo, estacionamiento);

    const baja = await api('DELETE', `/vehiculos/${vehiculo.id_vehiculo}`, { token: conductor.token });
    assert.equal(baja.estado, 409);
  });

  test('la patente de uno dado de baja se puede volver a registrar (D-17)', async () => {
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    await api('DELETE', `/vehiculos/${vehiculo.id_vehiculo}`, { token: conductor.token });

    const otro = await crearUsuario();
    const alta = await api('POST', '/vehiculos', {
      token: otro.token,
      body: { patente: vehiculo.patente, id_tipo_vehiculo: 1 },
    });
    assert.equal(alta.estado, 201);
  });
});
