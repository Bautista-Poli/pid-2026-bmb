// Abonos por turno: planes, compra y reservas con abono.
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

before(() => levantarApi('abono'));
after(() => cerrarApi());

const rutaPlanes = (estacionamiento) =>
  `/estacionamientos/${estacionamiento.id_estacionamiento}/planes-abono`;

const crearPlan = (propietario, estacionamiento, plan = { turno: 'MANANA', cupos: 2, precio: 30000 }) =>
  api('POST', rutaPlanes(estacionamiento), { token: propietario.token, body: plan });

describe('planes de abono', () => {
  test('el propietario ofrece un plan por turno y se ve en publico', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const manana = await crearPlan(propietario, estacionamiento);
    await crearPlan(propietario, estacionamiento, { turno: 'NOCHE', cupos: 10, precio: 50000 });

    assert.equal(manana.estado, 201);
    assert.equal(manana.datos.plan.turno, 'MANANA');
    assert.equal(manana.datos.plan.cupos, 2);
    assert.equal(manana.datos.plan.precio, 30000);

    const publicos = await api('GET', rutaPlanes(estacionamiento));
    assert.deepEqual(publicos.datos.planes.map((p) => p.turno), ['MANANA', 'NOCHE']);
  });

  test('un segundo plan activo del mismo turno da 409', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    await crearPlan(propietario, estacionamiento);

    const repetido = await crearPlan(propietario, estacionamiento);

    assert.equal(repetido.estado, 409);
    assert.match(motivo(repetido), /ya hay un plan activo/i);
  });

  test('editar y dar de baja; despues se puede volver a ofrecer el turno', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const { datos } = await crearPlan(propietario, estacionamiento);
    const ruta = `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`;

    const editado = await api('PATCH', ruta, { token: propietario.token, body: { cupos: 5 } });
    assert.equal(editado.datos.plan.cupos, 5);

    assert.equal((await api('DELETE', ruta, { token: propietario.token })).estado, 204);
    assert.equal((await api('GET', rutaPlanes(estacionamiento))).datos.planes.length, 0);
    assert.equal((await crearPlan(propietario, estacionamiento)).estado, 201);
  });

  test('no se ofrece un turno en que el estacionamiento esta cerrado', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token, {
      horarios: [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
        dia_semana,
        hora_apertura: '08:00',
        hora_cierre: '17:00',
      })),
    });

    const noche = await crearPlan(propietario, estacionamiento, { turno: 'NOCHE', cupos: 2, precio: 100 });
    const manana = await crearPlan(propietario, estacionamiento, { turno: 'MANANA', cupos: 2, precio: 100 });

    assert.equal(noche.estado, 409);
    assert.match(motivo(noche), /no abre en el turno noche/i);
    assert.equal(manana.estado, 201);
  });

  test('datos invalidos: 400', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);

    for (const plan of [
      { turno: 'MADRUGADA', cupos: 2, precio: 100 },
      { turno: 'MANANA', cupos: 0, precio: 100 },
      { turno: 'MANANA', cupos: 2, precio: -1 },
    ]) {
      assert.equal((await crearPlan(propietario, estacionamiento, plan)).estado, 400, JSON.stringify(plan));
    }
  });

  test('otro propietario no puede crear ni tocar planes ajenos', async () => {
    const duenio = await crearUsuario({ rol: 'PROPIETARIO' });
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(duenio.token);
    const { datos } = await crearPlan(duenio, estacionamiento);

    assert.equal((await crearPlan(otro, estacionamiento, { turno: 'TARDE', cupos: 1, precio: 1 })).estado, 403);
    const ruta = `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`;
    assert.equal((await api('PATCH', ruta, { token: otro.token, body: { cupos: 9 } })).estado, 403);
    assert.equal((await api('DELETE', ruta, { token: otro.token })).estado, 403);
  });

  test('PATCH sin cupos ni precio (vacio o null): 400', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const { datos } = await crearPlan(propietario, estacionamiento);
    const ruta = `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`;

    for (const body of [{ cupos: null }, {}]) {
      assert.equal((await api('PATCH', ruta, { token: propietario.token, body })).estado, 400, JSON.stringify(body));
    }
  });
});

/** Estacionamiento con un plan de manana (2 usos) y un conductor que lo compro. */
async function escenario({ cocheras = 1, cupos = 2 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras });
  const { datos } = await crearPlan(propietario, estacionamiento, { turno: 'MANANA', cupos, precio: 30000 });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const compra = await api('POST', '/abonos', { token: conductor.token, body: { id_plan: datos.plan.id_plan } });
  return { propietario, estacionamiento, plan: datos.plan, conductor, vehiculo, abono: compra.datos.abono };
}

describe('comprar y administrar abonos', () => {
  test('comprar un plan crea un abono vigente por 30 dias con los datos del plan', async () => {
    const { abono, plan, estacionamiento } = await escenario();

    assert.equal(abono.estado, 'VIGENTE');
    assert.equal(abono.id_plan, plan.id_plan);
    assert.equal(abono.id_estacionamiento, estacionamiento.id_estacionamiento);
    assert.equal(abono.turno, 'MANANA');
    assert.equal(abono.cupos_totales, 2);
    assert.equal(abono.cupos_usados, 0);
    assert.equal(abono.cupos_restantes, 2);
    assert.equal(abono.precio_total, 30000);
    const dias = (Date.parse(abono.hasta) - Date.parse(abono.desde)) / 86_400_000;
    assert.equal(dias, 29);
  });

  test('cambiar el plan despues no cambia el abono vendido', async () => {
    const { propietario, estacionamiento, plan, conductor } = await escenario();
    await api('PATCH', `${rutaPlanes(estacionamiento)}/${plan.id_plan}`, {
      token: propietario.token,
      body: { cupos: 50, precio: 1 },
    });

    const { datos } = await api('GET', '/abonos', { token: conductor.token });

    assert.equal(datos.abonos[0].cupos_totales, 2);
    assert.equal(datos.abonos[0].precio_total, 30000);
  });

  test('no se compra un plan dado de baja ni uno inexistente', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const estacionamiento = await crearEstacionamiento(propietario.token);
    const { datos } = await crearPlan(propietario, estacionamiento);
    await api('DELETE', `${rutaPlanes(estacionamiento)}/${datos.plan.id_plan}`, { token: propietario.token });
    const conductor = await crearUsuario();

    const deBaja = await api('POST', '/abonos', { token: conductor.token, body: { id_plan: datos.plan.id_plan } });
    const inexistente = await api('POST', '/abonos', {
      token: conductor.token,
      body: { id_plan: crypto.randomUUID() },
    });

    assert.equal(deBaja.estado, 404);
    assert.equal(inexistente.estado, 404);
  });

  test('el propietario ve los abonos vendidos de su estacionamiento; otro no', async () => {
    const { propietario, estacionamiento, abono } = await escenario();
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/abonos`;

    const vendidos = await api('GET', ruta, { token: propietario.token });
    assert.deepEqual(vendidos.datos.abonos.map((a) => a.id_abono), [abono.id_abono]);

    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    assert.equal((await api('GET', ruta, { token: otro.token })).estado, 403);
  });

  test('cancelar el abono: queda CANCELADO y otro conductor no puede cancelarlo', async () => {
    const { conductor, abono } = await escenario();
    const ajeno = await crearUsuario();

    const intento = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: ajeno.token });
    assert.equal(intento.estado, 404);

    const { estado, datos } = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    assert.equal(estado, 200);
    assert.equal(datos.abono.estado, 'CANCELADO');

    const otraVez = await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    assert.equal(otraVez.estado, 409);
  });

  test('vencerAbonos pasa a VENCIDO los que terminaron', async () => {
    const { abono } = await escenario();
    await query(
      `UPDATE abono SET desde = current_date - 40, hasta = current_date - 11 WHERE id_abono = $1`,
      [abono.id_abono],
    );

    const { vencerAbonos } = await import('../src/services/abono.service.js');
    await vencerAbonos();

    const { rows } = await query('SELECT estado::text FROM abono WHERE id_abono = $1', [abono.id_abono]);
    assert.equal(rows[0].estado, 'VENCIDO');
  });
});

const reservarConAbono = (conductor, abono, vehiculo, cuando) =>
  api('POST', '/reservas', {
    token: conductor.token,
    body: { id_abono: abono.id_abono, id_vehiculo: vehiculo.id_vehiculo, ...cuando },
  });

const usosRestantes = async (conductor) =>
  (await api('GET', '/abonos', { token: conductor.token })).datos.abonos[0].cupos_restantes;

describe('reservar con abono', () => {
  test('dentro del turno: CONFIRMADA, gratis y descuenta un uso', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const { estado, datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '10:00'));

    assert.equal(estado, 201);
    assert.equal(datos.reserva.estado, 'CONFIRMADA');
    assert.equal(datos.reserva.modalidad, 'ABONO');
    assert.equal(datos.reserva.precio_total, 0);
    assert.equal(datos.reserva.id_abono, abono.id_abono);
    assert.equal(datos.reserva.turno_abono, 'MANANA');
    assert.equal(await usosRestantes(conductor), 1);
  });

  test('sin usos restantes: 409', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cupos: 1 });
    await reservarConAbono(conductor, abono, vehiculo, franja('06:00', '07:00'));

    const sinUsos = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));

    assert.equal(sinUsos.estado, 409);
    assert.match(motivo(sinUsos), /no te quedan usos/i);
  });

  test('cancelar la reserva devuelve el uso', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cupos: 1 });
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('06:00', '07:00'));
    await api('PATCH', `/reservas/${datos.reserva.id_reserva}/cancelar`, { token: conductor.token });

    assert.equal(await usosRestantes(conductor), 1);
    const otra = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    assert.equal(otra.estado, 201);
  });

  test('fuera del turno o cruzando su borde: 409 con el horario del turno', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    for (const cuando of [franja('13:00', '14:00'), franja('11:00', '13:00')]) {
      const respuesta = await reservarConAbono(conductor, abono, vehiculo, cuando);
      assert.equal(respuesta.estado, 409);
      assert.match(motivo(respuesta), /turno manana \(06:00 a 12:00\)/i);
    }
  });

  test('fuera de la vigencia: 409 aunque el job no lo haya vencido', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const despues = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00', 40));

    assert.equal(despues.estado, 409);
    assert.match(motivo(despues), /el abono vale del/i);
  });

  test('abono cancelado: 409; abono de otro conductor: 404', async () => {
    const { conductor, abono, vehiculo } = await escenario();
    const ajeno = await crearUsuario();
    const vehiculoAjeno = await crearVehiculo(ajeno.token);

    const deOtro = await reservarConAbono(ajeno, abono, vehiculoAjeno, franja('08:00', '09:00'));
    assert.equal(deOtro.estado, 404);

    await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });
    const cancelado = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    assert.equal(cancelado.estado, 409);
  });

  test('con id_abono no se manda modalidad: 400', async () => {
    const { conductor, abono, vehiculo } = await escenario();

    const respuesta = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_abono: abono.id_abono, id_vehiculo: vehiculo.id_vehiculo, modalidad: 'HORA', ...franja() },
    });

    assert.equal(respuesta.estado, 400);
  });

  test('dos reservas simultaneas por el ultimo uso: solo una se crea', async () => {
    const { conductor, abono, vehiculo } = await escenario({ cocheras: 2, cupos: 1 });
    const otroVehiculo = await crearVehiculo(conductor.token);

    const respuestas = await Promise.all([
      reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00')),
      reservarConAbono(conductor, abono, otroVehiculo, franja('08:00', '09:00')),
    ]);

    assert.equal(respuestas.filter((r) => r.estado === 201).length, 1);
    assert.equal(respuestas.filter((r) => r.estado === 409).length, 1);
  });

  test('sin cochera libre: 409 como cualquier reserva (el abono no garantiza lugar)', async () => {
    const { estacionamiento, conductor, abono, vehiculo } = await escenario();
    const otroConductor = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otroConductor.token);
    await api('POST', '/reservas', {
      token: otroConductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: otroVehiculo.id_vehiculo,
        ...franja('08:00', '10:00'),
      },
    });

    const respuesta = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '10:00'));

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /no quedan cocheras libres/i);
    assert.equal(await usosRestantes(conductor), 2);
  });

  test('cancelar el abono cancela sus reservas futuras', async () => {
    const { conductor, abono, vehiculo } = await escenario();
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));

    await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });

    const { rows } = await query('SELECT estado::text FROM reserva WHERE id_reserva = $1', [
      datos.reserva.id_reserva,
    ]);
    assert.equal(rows[0].estado, 'CANCELADA');
  });

  test('ingreso y egreso con el codigo de una reserva con abono', async () => {
    const { propietario, conductor, abono, vehiculo } = await escenario();
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    const reserva = datos.reserva;
    await ponerEnCurso(reserva.id_reserva);
    const acceder = () =>
      api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo: reserva.codigo_acceso } });

    const ingreso = await acceder();
    assert.equal(ingreso.estado, 200);
    assert.equal(ingreso.datos.accion, 'INGRESO');
    assert.equal(ingreso.datos.reserva.estado, 'ACTIVA');

    await query(`UPDATE reserva SET ingreso_real = now() - interval '10 minutes' WHERE id_reserva = $1`, [
      reserva.id_reserva,
    ]);
    const egreso = await acceder();
    assert.equal(egreso.estado, 200);
    assert.equal(egreso.datos.accion, 'EGRESO');
    assert.equal(egreso.datos.reserva.estado, 'FINALIZADA');
  });

  test('cancelar el abono no toca una reserva ya ACTIVA', async () => {
    const { propietario, conductor, abono, vehiculo } = await escenario();
    const { datos } = await reservarConAbono(conductor, abono, vehiculo, franja('08:00', '09:00'));
    await ponerEnCurso(datos.reserva.id_reserva);
    const ingreso = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/ingreso`, {
      token: propietario.token,
    });
    assert.equal(ingreso.estado, 200);

    await api('PATCH', `/abonos/${abono.id_abono}/cancelar`, { token: conductor.token });

    const { rows } = await query('SELECT estado::text FROM reserva WHERE id_reserva = $1', [
      datos.reserva.id_reserva,
    ]);
    assert.equal(rows[0].estado, 'ACTIVA');
  });

  test('una reserva comun no trae abono', async () => {
    const { estacionamiento, conductor, vehiculo } = await escenario();

    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: {
        id_estacionamiento: estacionamiento.id_estacionamiento,
        id_vehiculo: vehiculo.id_vehiculo,
        ...franja('14:00', '15:00'),
      },
    });

    assert.equal(datos.reserva.id_abono, null);
    assert.equal(datos.reserva.turno_abono, null);
    assert.equal(datos.reserva.modalidad, 'HORA');
  });
});
