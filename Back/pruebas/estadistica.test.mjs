// Estadisticas del propietario: ocupacion, ingresos, demanda, cancelaciones y
// ausentes de un periodo. Las reservas se insertan por SQL en dias fijos del
// pasado (la API no deja reservar hacia atras) para tener numeros exactos.
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
  query,
} from './ayuda.mjs';

before(() => levantarApi('estadistica'));
after(() => cerrarApi());

describe('cancelada_en', () => {
  test('cancelar una reserva guarda cuando se cancelo', async () => {
    const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const conductor = await crearUsuario();
    const vehiculo = await crearVehiculo(conductor.token);
    const estacionamiento = await crearEstacionamiento(propietario.token);

    const { datos } = await api('POST', '/reservas', {
      token: conductor.token,
      body: { id_estacionamiento: estacionamiento.id_estacionamiento, id_vehiculo: vehiculo.id_vehiculo, ...franja() },
    });
    const cancelada = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/cancelar`, { token: conductor.token });
    assert.equal(cancelada.estado, 200);

    const { rows } = await query('SELECT cancelada_en, cancelada_por FROM reserva WHERE id_reserva = $1', [
      datos.reserva.id_reserva,
    ]);
    assert.ok(rows[0].cancelada_en instanceof Date);
    assert.ok(Date.now() - rows[0].cancelada_en.getTime() < 60_000);
    assert.equal(rows[0].cancelada_por, 'CONDUCTOR');
  });
});

/* ------------------------------------------------------------------------ */

/** YYYY-MM-DD de hace `dias` dias, en hora argentina. */
const diaLocal = (dias) =>
  new Date(Date.now() - 3 * 3_600_000 - dias * 86_400_000).toISOString().slice(0, 10);
const D = diaLocal(10);
const D1 = diaLocal(9);
/** Dia de la semana (0 = domingo) de una fecha local. */
const dowDe = (fecha) => new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
const instante = (fecha, hora) => `${fecha}T${hora}:00-03:00`;

const ABIERTO_8_A_20 = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
  dia_semana,
  hora_apertura: '08:00',
  hora_cierre: '20:00',
}));

const ABIERTO_24_H = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
  dia_semana,
  hora_apertura: '00:00',
  hora_cierre: '23:59',
}));

/** Propietario con un estacionamiento 08-20 todos los dias y 2 cocheras, y un conductor. */
async function escenario({ horarios = ABIERTO_8_A_20 } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);
  const estacionamiento = await crearEstacionamiento(propietario.token, { cocheras: 2, horarios });
  const { rows } = await query(
    'SELECT id_cochera FROM cochera WHERE id_estacionamiento = $1 ORDER BY identificador',
    [estacionamiento.id_estacionamiento],
  );
  return {
    propietario,
    conductor,
    vehiculo,
    estacionamiento,
    cocheras: rows.map((r) => r.id_cochera),
    /** Inserta una reserva tal cual (sin pasar por las reglas de la API). */
    reserva: async ({
      cochera = 0,
      inicio,
      fin,
      estado = 'FINALIZADA',
      precio = 0,
      modalidad = 'HORA',
      canceladaPor = null,
      canceladaEn = null,
    }) => {
      await query(
        `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, precio_total,
                              modalidad, cancelada_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id_reserva`,
        [conductor.id, vehiculo.id_vehiculo, rows[cochera].id_cochera, inicio, fin, estado, precio, modalidad, canceladaPor],
      ).then(async ({ rows: creada }) => {
        if (canceladaEn) {
          await query('UPDATE reserva SET cancelada_en = $2 WHERE id_reserva = $1', [creada[0].id_reserva, canceladaEn]);
        }
      });
    },
  };
}

const estadisticas = (token, params) =>
  api('GET', `/estadisticas/propietario?${new URLSearchParams(params)}`, { token });

describe('estadisticas del propietario', () => {
  test('ocupacion: horas usadas sobre horas ofrecidas del dia', async () => {
    const e = await escenario();
    await e.reserva({ cochera: 0, inicio: instante(D, '09:00'), fin: instante(D, '11:00') });
    await e.reserva({ cochera: 1, inicio: instante(D, '14:00'), fin: instante(D, '17:00') });

    const { estado, datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(estado, 200);
    assert.deepEqual(datos.ocupacionPorDia, [{ fecha: D, horasUsadas: 5, horasOfrecidas: 24 }]);
    assert.equal(datos.kpis.ocupacion.valor, 5 / 24);
  });

  test('una reserva que cruza la medianoche reparte sus horas entre los dos dias', async () => {
    const e = await escenario({ horarios: ABIERTO_24_H });
    await e.reserva({ inicio: instante(D, '23:00'), fin: instante(D1, '01:00') });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D1 });
    assert.deepEqual(
      datos.ocupacionPorDia.map((d) => [d.fecha, d.horasUsadas]),
      [[D, 1], [D1, 1]],
    );
    // Si el periodo es solo el primer dia, la hora del dia siguiente no cuenta.
    const soloD = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(soloD.datos.ocupacionPorDia[0].horasUsadas, 1);
  });

  test('sin horarios cargados la ocupacion es 0 y no NaN', async () => {
    const e = await escenario({ horarios: [] });
    await e.reserva({ inicio: instante(D, '09:00'), fin: instante(D, '10:00') });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.kpis.ocupacion.valor, 0);
    assert.equal(datos.ocupacionPorDia[0].horasOfrecidas, 0);
  });

  test('ingresos: finalizadas y activas; no canceladas, ausentes ni con abono', async () => {
    const e = await escenario();
    await e.reserva({ cochera: 0, inicio: instante(D, '08:00'), fin: instante(D, '09:00'), precio: 3000 });
    await e.reserva({ cochera: 1, inicio: instante(D, '08:00'), fin: instante(D, '09:00'), precio: 2000, estado: 'ACTIVA' });
    await e.reserva({ cochera: 0, inicio: instante(D, '10:00'), fin: instante(D, '11:00'), precio: 999, estado: 'CANCELADA' });
    await e.reserva({ cochera: 0, inicio: instante(D, '12:00'), fin: instante(D, '13:00'), precio: 888, estado: 'NO_SHOW' });
    await e.reserva({ cochera: 0, inicio: instante(D, '14:00'), fin: instante(D, '15:00'), precio: 0, modalidad: 'ABONO' });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.deepEqual(datos.ingresosPorDia, [{ fecha: D, reservas: 5000, abonos: 0 }]);
    assert.equal(datos.kpis.ingresos.valor, 5000);
    // La ausente no ocupo la cochera: 1 + 1 + 1 (la del abono) horas usadas.
    assert.equal(datos.ocupacionPorDia[0].horasUsadas, 3);
  });

  test('un abono vendido suma en ingresos el dia de la compra', async () => {
    const e = await escenario();
    const ruta = `/estacionamientos/${e.estacionamiento.id_estacionamiento}/planes-abono`;
    const plan = await api('POST', ruta, {
      token: e.propietario.token,
      body: { turno: 'MANANA', cupos: 2, precio: 30000 },
    });
    await api('POST', '/abonos', { token: e.conductor.token, body: { id_plan: plan.datos.plan.id_plan } });

    const hoy = diaLocal(0);
    const { datos } = await estadisticas(e.propietario.token, { desde: hoy, hasta: hoy });
    assert.equal(datos.ingresosPorDia[0].abonos, 30000);
    assert.equal(datos.kpis.ingresos.valor, 30000);
  });

  test('demanda por dia de la semana y hora, con la hora pico', async () => {
    const e = await escenario();
    await e.reserva({ cochera: 0, inicio: instante(D, '09:00'), fin: instante(D, '11:00') });
    await e.reserva({ cochera: 1, inicio: instante(D, '10:00'), fin: instante(D, '10:30') });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    const celda = (hora) => datos.demanda.find((c) => c.diaSemana === dowDe(D) && c.hora === hora)?.reservas ?? 0;
    assert.equal(celda(9), 1);
    assert.equal(celda(10), 2);
    assert.equal(celda(11), 0);
    assert.deepEqual(datos.horaPico, { diaSemana: dowDe(D), hora: 10 });
  });

  test('cancelaciones por origen, anticipacion del conductor y ausentes', async () => {
    const e = await escenario();
    const hora = (h) => instante(D, `${String(h).padStart(2, '0')}:00`);
    await e.reserva({ inicio: hora(8), fin: hora(9), estado: 'CANCELADA', canceladaPor: 'CONDUCTOR', canceladaEn: instante(D, '03:00') });
    await e.reserva({ inicio: hora(9), fin: hora(10), estado: 'CANCELADA', canceladaPor: 'PROPIETARIO' });
    await e.reserva({ inicio: hora(10), fin: hora(11), estado: 'CANCELADA', canceladaPor: 'SISTEMA' });
    await e.reserva({ inicio: hora(11), fin: hora(12), estado: 'CANCELADA' });
    await e.reserva({ inicio: hora(12), fin: hora(13), estado: 'NO_SHOW' });
    for (let h = 13; h < 18; h++) await e.reserva({ inicio: hora(h), fin: hora(h + 1) });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.kpis.reservas.valor, 10);
    assert.equal(datos.cancelaciones.total, 4);
    assert.deepEqual(datos.cancelaciones.porOrigen, { CONDUCTOR: 1, PROPIETARIO: 1, SISTEMA: 1, SIN_DATO: 1 });
    assert.equal(datos.cancelaciones.anticipacionPromedioHoras, 5);
    assert.equal(datos.kpis.tasaCancelacion.valor, 0.4);
    assert.deepEqual(datos.ausentes, { total: 1, tasa: 0.1 });
    assert.equal(datos.kpis.ausentes.valor, 1);
  });

  test('las reservas de otro propietario no se cuentan', async () => {
    const e = await escenario();
    const otro = await escenario();
    await otro.reserva({ inicio: instante(D, '09:00'), fin: instante(D, '12:00'), precio: 7000 });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.kpis.reservas.valor, 0);
    assert.equal(datos.kpis.ingresos.valor, 0);
    assert.equal(datos.ocupacionPorDia[0].horasUsadas, 0);
    assert.equal(datos.horaPico, null);
  });

  test('filtra por estacionamiento, y uno ajeno da 404', async () => {
    const e = await escenario();
    const segundo = await crearEstacionamiento(e.propietario.token, { cocheras: 1, horarios: ABIERTO_8_A_20 });
    await e.reserva({ inicio: instante(D, '09:00'), fin: instante(D, '10:00'), precio: 1000 });

    const delSegundo = await estadisticas(e.propietario.token, {
      desde: D,
      hasta: D,
      id_estacionamiento: segundo.id_estacionamiento,
    });
    assert.equal(delSegundo.datos.kpis.ingresos.valor, 0);
    assert.equal(delSegundo.datos.ocupacionPorDia[0].horasOfrecidas, 12);

    const otro = await escenario();
    const ajeno = await estadisticas(e.propietario.token, {
      desde: D,
      hasta: D,
      id_estacionamiento: otro.estacionamiento.id_estacionamiento,
    });
    // 404 y no 403: no se confirma que exista un estacionamiento de otro.
    assert.equal(ajeno.estado, 404);
  });

  test('trae los KPIs del periodo anterior de igual largo', async () => {
    const e = await escenario();
    const antes = diaLocal(11);
    await e.reserva({ inicio: instante(antes, '09:00'), fin: instante(antes, '10:00'), precio: 4000 });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.kpis.ingresos.valor, 0);
    assert.equal(datos.kpis.ingresos.anterior, 4000);
  });

  test('una jornada de 24 h en un lugar que abre 12 h no pasa el 100 %', async () => {
    const e = await escenario();
    await e.reserva({ inicio: instante(D, '00:00'), fin: instante(D1, '00:00'), modalidad: 'JORNADA' });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    // Solo cuentan las horas dentro del horario (08-20) de esa cochera.
    assert.equal(datos.ocupacionPorDia[0].horasUsadas, 12);
    assert.ok(datos.kpis.ocupacion.valor <= 1);
  });

  test('un estacionamiento sin horarios no infla la ocupacion del total', async () => {
    const e = await escenario();
    const sinHorario = await crearEstacionamiento(e.propietario.token, { cocheras: 1, horarios: [] });
    const { rows } = await query('SELECT id_cochera FROM cochera WHERE id_estacionamiento = $1', [
      sinHorario.id_estacionamiento,
    ]);
    await query(
      `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, precio_total)
       VALUES ($1, $2, $3, $4, $5, 'FINALIZADA', 0)`,
      [e.conductor.id, e.vehiculo.id_vehiculo, rows[0].id_cochera, instante(D, '09:00'), instante(D, '19:00')],
    );

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.ocupacionPorDia[0].horasUsadas, 0);
    assert.equal(datos.kpis.ocupacion.valor, 0);
  });

  test('las cocheras dadas de baja no suman horas usadas', async () => {
    const e = await escenario();
    await e.reserva({ cochera: 0, inicio: instante(D, '09:00'), fin: instante(D, '11:00') });
    await query('UPDATE cochera SET activo = FALSE WHERE id_cochera = $1', [e.cocheras[0]]);

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.deepEqual(datos.ocupacionPorDia, [{ fecha: D, horasUsadas: 0, horasOfrecidas: 12 }]);
  });

  test('abierto hasta las 23:59 cuenta como hasta medianoche', async () => {
    const e = await escenario({ horarios: ABIERTO_24_H });
    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.ocupacionPorDia[0].horasOfrecidas, 48);
  });

  test('la anticipacion no cuenta cancelaciones despues del inicio', async () => {
    const e = await escenario();
    await e.reserva({
      inicio: instante(D, '08:00'),
      fin: instante(D, '09:00'),
      estado: 'CANCELADA',
      canceladaPor: 'CONDUCTOR',
      canceladaEn: instante(D, '06:00'),
    });
    await e.reserva({
      inicio: instante(D, '10:00'),
      fin: instante(D, '11:00'),
      estado: 'CANCELADA',
      canceladaPor: 'CONDUCTOR',
      canceladaEn: instante(D, '10:30'),
    });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.cancelaciones.anticipacionPromedioHoras, 2);
  });

  test('por cobrar: las confirmadas que todavia no empezaron, aunque sean despues del periodo', async () => {
    const e = await escenario();
    const manana = franja('09:00', '11:00', 1);
    const enUnaSemana = franja('09:00', '10:00', 7);
    await e.reserva({ cochera: 0, ...manana, estado: 'CONFIRMADA', precio: 3000 });
    await e.reserva({ cochera: 1, ...enUnaSemana, estado: 'CONFIRMADA', precio: 1500 });
    await e.reserva({ cochera: 0, ...enUnaSemana, estado: 'CANCELADA', precio: 999 });

    const { datos } = await estadisticas(e.propietario.token, { desde: D, hasta: D });
    assert.equal(datos.ingresosProyectados, 4500);
  });

  test('validaciones y permisos', async () => {
    const e = await escenario();
    const conductor = await crearUsuario();

    assert.equal((await estadisticas(conductor.token, { desde: D, hasta: D })).estado, 403);
    assert.equal((await estadisticas(e.propietario.token, { desde: D1, hasta: D })).estado, 400);
    assert.equal((await estadisticas(e.propietario.token, { desde: diaLocal(120), hasta: D })).estado, 400);
    assert.equal((await estadisticas(e.propietario.token, { desde: 'ayer', hasta: D })).estado, 400);
    // Fechas que no existen: Date.parse las corre al mes siguiente, la base no.
    assert.equal((await estadisticas(e.propietario.token, { desde: '2026-02-31', hasta: '2026-03-02' })).estado, 400);
    assert.equal((await estadisticas(e.propietario.token, { desde: '2026-04-31', hasta: '2026-04-31' })).estado, 400);
  });
});
