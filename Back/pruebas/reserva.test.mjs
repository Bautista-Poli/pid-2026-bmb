// Reservas: creacion, reglas de solapamiento, concurrencia y ciclo completo.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cambiarRol,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  diaSemanaDe,
  franja,
  levantarApi,
  motivo,
  ponerEnCurso,
  query,
} from './ayuda.mjs';

before(() => levantarApi('reserva'));
after(() => cerrarApi());

/** Propietario con estacionamiento y conductor con vehiculo, listos para reservar. */
async function escenario({ cocheras = 1, horarios, tarifas } = {}) {
  const propietario = await crearUsuario({ rol: 'PROPIETARIO' });
  const estacionamiento = await crearEstacionamiento(propietario.token, {
    cocheras,
    horarios,
    tarifas,
  });
  const conductor = await crearUsuario();
  const vehiculo = await crearVehiculo(conductor.token);

  return { propietario, estacionamiento, conductor, vehiculo };
}

const reservar = (conductor, estacionamiento, vehiculo, cuando) =>
  api('POST', '/reservas', {
    token: conductor.token,
    body: {
      id_estacionamiento: estacionamiento.id_estacionamiento,
      id_vehiculo: vehiculo.id_vehiculo,
      ...cuando,
    },
  });

/** Bloque de `horas` horas que arranca manana a `hora` (hora argentina). */
function bloque(horas, hora = '08:00') {
  const dia = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const inicio = `${dia}T${hora}:00-03:00`;
  const fin = new Date(Date.parse(inicio) + horas * 3_600_000).toISOString();
  return { inicio, fin };
}

describe('crear una reserva', () => {
  test('nace PENDIENTE y con una cochera asignada', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, franja());

    assert.equal(estado, 201);
    assert.equal(datos.reserva.estado, 'PENDIENTE');
    assert.ok(datos.reserva.id_cochera);
    assert.equal(datos.reserva.precio_total, 2000); // 2 horas x 1000
    assert.equal(datos.reserva.modalidad, 'HORA');
  });

  test('aparece en las reservas del conductor y en las del estacionamiento', async () => {
    const { conductor, propietario, estacionamiento, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());

    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas.length, 1);
    assert.equal(mias.datos.reservas[0].id_reserva, datos.reserva.id_reserva);

    const recibidas = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reservas`,
      { token: propietario.token },
    );
    assert.equal(recibidas.datos.reservas.length, 1);
  });

  test('no se reserva en el pasado', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const { estado } = await reservar(
      conductor,
      estacionamiento,
      vehiculo,
      franja('08:00', '10:00', -1),
    );
    assert.equal(estado, 400);
  });

  test('no se reserva fuera del horario de atencion', async () => {
    const cuando = franja('17:00', '21:00');
    // El estacionamiento abre ese mismo dia, pero solo a la manana.
    const { conductor, estacionamiento, vehiculo } = await escenario({
      horarios: [
        { dia_semana: diaSemanaDe(cuando.inicio), hora_apertura: '08:00', hora_cierre: '10:00' },
      ],
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, cuando);
    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /fuera del horario/i);
  });

  test('no se reserva un dia que el estacionamiento no abre', async () => {
    const cuando = franja();
    const otroDia = (diaSemanaDe(cuando.inicio) + 1) % 7;
    const { conductor, estacionamiento, vehiculo } = await escenario({
      horarios: [{ dia_semana: otroDia, hora_apertura: '08:00', hora_cierre: '20:00' }],
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, cuando);
    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /no abre/i);
  });

  test('el tipo de vehiculo tiene que coincidir con el de la cochera', async () => {
    const { conductor, estacionamiento } = await escenario();
    const moto = await crearVehiculo(conductor.token, { tipo: 2 });

    const respuesta = await reservar(conductor, estacionamiento, moto, franja());
    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /tipo de vehiculo|cocheras/i);
  });
});

describe('nada se reserva dos veces', () => {
  test('la segunda reserva toma la otra cochera y la tercera no entra', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ cocheras: 2 });
    const otroConductor = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otroConductor.token);
    const tercerConductor = await crearUsuario();
    const tercerVehiculo = await crearVehiculo(tercerConductor.token);
    const cuando = franja();

    const primera = await reservar(conductor, estacionamiento, vehiculo, cuando);
    const segunda = await reservar(otroConductor, estacionamiento, otroVehiculo, cuando);
    const tercera = await reservar(tercerConductor, estacionamiento, tercerVehiculo, cuando);

    assert.equal(primera.estado, 201);
    assert.equal(segunda.estado, 201);
    assert.notEqual(primera.datos.reserva.id_cochera, segunda.datos.reserva.id_cochera);

    assert.equal(tercera.estado, 409);
    assert.match(motivo(tercera), /no quedan cocheras/i);
  });

  test('el mismo vehiculo no puede estar en dos lugares a la vez', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const otroPropietario = await crearUsuario({ rol: 'PROPIETARIO' });
    const otroEstacionamiento = await crearEstacionamiento(otroPropietario.token);
    const cuando = franja();

    assert.equal((await reservar(conductor, estacionamiento, vehiculo, cuando)).estado, 201);

    const superpuesta = await reservar(conductor, otroEstacionamiento, vehiculo, cuando);
    assert.equal(superpuesta.estado, 409);
    assert.match(motivo(superpuesta), /vehiculo/i);
  });

  test('tres pedidos simultaneos con un solo lugar: una sola reserva', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const cuando = franja('13:00', '17:00');

    const respuestas = await Promise.all([
      reservar(conductor, estacionamiento, vehiculo, cuando),
      reservar(conductor, estacionamiento, vehiculo, cuando),
      reservar(conductor, estacionamiento, vehiculo, cuando),
    ]);

    const creadas = respuestas.filter((r) => r.estado === 201);
    const rechazadas = respuestas.filter((r) => r.estado === 409);
    assert.equal(creadas.length, 1);
    assert.equal(rechazadas.length, 2);
  });

  test('la disponibilidad descuenta la cochera tomada', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const cuando = franja('10:00', '13:00');
    const fecha = cuando.inicio.slice(0, 10);
    const ruta = `/estacionamientos/${estacionamiento.id_estacionamiento}/disponibilidad?fecha=${fecha}`;

    const antes = await api('GET', ruta);
    const franjaAntes = antes.datos.franjas.find((f) => f.hora_desde === '10:00');
    assert.equal(franjaAntes.cocheras_libres, 1);

    await reservar(conductor, estacionamiento, vehiculo, cuando);

    const despues = await api('GET', ruta);
    const franjaDespues = despues.datos.franjas.find((f) => f.hora_desde === '10:00');
    assert.equal(franjaDespues.cocheras_libres, 0);
    assert.equal(franjaDespues.disponible, false);
  });
});

describe('cancelacion', () => {
  test('el conductor cancela la suya, una sola vez', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());
    const ruta = `/reservas/${datos.reserva.id_reserva}/cancelar`;

    const cancelada = await api('PATCH', ruta, { token: conductor.token });
    assert.equal(cancelada.estado, 200);
    assert.equal(cancelada.datos.reserva.estado, 'CANCELADA');

    const otraVez = await api('PATCH', ruta, { token: conductor.token });
    assert.equal(otraVez.estado, 409);
  });

  test('otro conductor no puede cancelarla', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const ajeno = await crearUsuario();
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());

    const { estado } = await api('PATCH', `/reservas/${datos.reserva.id_reserva}/cancelar`, {
      token: ajeno.token,
    });
    assert.equal(estado, 403);
  });

  test('cancelar libera la franja para otro', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const otroConductor = await crearUsuario();
    const otroVehiculo = await crearVehiculo(otroConductor.token);
    const cuando = franja();

    const primera = await reservar(conductor, estacionamiento, vehiculo, cuando);
    assert.equal((await reservar(otroConductor, estacionamiento, otroVehiculo, cuando)).estado, 409);

    await api('PATCH', `/reservas/${primera.datos.reserva.id_reserva}/cancelar`, {
      token: conductor.token,
    });

    const segunda = await reservar(otroConductor, estacionamiento, otroVehiculo, cuando);
    assert.equal(segunda.estado, 201);
  });
});

describe('ciclo de la reserva', () => {
  test('confirmar, ingreso y egreso, con la cochera siguiendo el estado', async () => {
    const { conductor, propietario, estacionamiento, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());
    const id = datos.reserva.id_reserva;
    const idCochera = datos.reserva.id_cochera;
    const estadoCochera = async () => {
      const { rows } = await query('SELECT estado_actual FROM cochera WHERE id_cochera = $1', [
        idCochera,
      ]);
      return rows[0].estado_actual;
    };

    // Sin confirmar no hay ingreso.
    const temprano = await api('PATCH', `/reservas/${id}/ingreso`, { token: propietario.token });
    assert.equal(temprano.estado, 409);
    assert.match(motivo(temprano), /confirmar/i);

    const confirmada = await api('PATCH', `/reservas/${id}/confirmar`, {
      token: propietario.token,
    });
    assert.equal(confirmada.estado, 200);
    assert.equal(confirmada.datos.reserva.estado, 'CONFIRMADA');

    // Todavia falta para la franja.
    const antesDeHora = await api('PATCH', `/reservas/${id}/ingreso`, { token: propietario.token });
    assert.equal(antesDeHora.estado, 409);
    assert.match(motivo(antesDeHora), /temprano/i);

    await ponerEnCurso(id);

    const ingreso = await api('PATCH', `/reservas/${id}/ingreso`, { token: propietario.token });
    assert.equal(ingreso.estado, 200);
    assert.equal(ingreso.datos.reserva.estado, 'EN_CURSO');
    assert.ok(ingreso.datos.reserva.ingreso_real);
    assert.equal(await estadoCochera(), 'OCUPADA');

    // Ya en curso, el conductor no puede cancelarla.
    const cancelar = await api('PATCH', `/reservas/${id}/cancelar`, { token: conductor.token });
    assert.equal(cancelar.estado, 409);

    const egreso = await api('PATCH', `/reservas/${id}/egreso`, { token: propietario.token });
    assert.equal(egreso.estado, 200);
    assert.equal(egreso.datos.reserva.estado, 'FINALIZADA');
    assert.ok(egreso.datos.reserva.egreso_real);
    assert.equal(await estadoCochera(), 'LIBRE');

    const repetido = await api('PATCH', `/reservas/${id}/egreso`, { token: propietario.token });
    assert.equal(repetido.estado, 409);
  });

  test('solo el propietario de la cochera maneja el ciclo', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario();
    const ajeno = await crearUsuario({ rol: 'PROPIETARIO' });
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());
    const ruta = `/reservas/${datos.reserva.id_reserva}/confirmar`;

    const porElConductor = await api('PATCH', ruta, { token: conductor.token });
    assert.equal(porElConductor.estado, 403);

    const porOtroPropietario = await api('PATCH', ruta, { token: ajeno.token });
    assert.equal(porOtroPropietario.estado, 403);
  });

  test('no se confirma dos veces y un id inexistente da 404', async () => {
    const { conductor, propietario, estacionamiento, vehiculo } = await escenario();
    const { datos } = await reservar(conductor, estacionamiento, vehiculo, franja());
    const ruta = `/reservas/${datos.reserva.id_reserva}/confirmar`;

    assert.equal((await api('PATCH', ruta, { token: propietario.token })).estado, 200);
    assert.equal((await api('PATCH', ruta, { token: propietario.token })).estado, 409);

    const inexistente = await api('PATCH', `/reservas/${crypto.randomUUID()}/confirmar`, {
      token: propietario.token,
    });
    assert.equal(inexistente.estado, 404);
  });

  test('el propietario que ademas es conductor usa el token de cada perfil', async () => {
    const ambos = await crearUsuario({ rol: 'PROPIETARIO', roles: ['PROPIETARIO', 'CONDUCTOR'] });
    const estacionamiento = await crearEstacionamiento(ambos.token);

    const comoConductor = await cambiarRol(ambos.token, 'CONDUCTOR');
    const vehiculo = await crearVehiculo(comoConductor);
    const reserva = await reservar(
      { token: comoConductor },
      estacionamiento,
      vehiculo,
      franja('17:00', '21:00'),
    );
    assert.equal(reserva.estado, 201);

    const comoPropietario = await cambiarRol(comoConductor, 'PROPIETARIO');
    const confirmada = await api('PATCH', `/reservas/${reserva.datos.reserva.id_reserva}/confirmar`, {
      token: comoPropietario,
    });
    assert.equal(confirmada.estado, 200);
  });
});

describe('modalidades de tarifa', () => {
  const TARIFAS = { tarifa_hora: 1000, tarifa_estadia: 5000, tarifa_jornada: 8000 };

  test('estadia: 12 horas a precio fijo', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 201);
    assert.equal(datos.reserva.modalidad, 'ESTADIA');
    assert.equal(datos.reserva.precio_total, 5000);
  });

  test('jornada: 24 horas a precio fijo', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(24),
      modalidad: 'JORNADA',
    });

    assert.equal(estado, 201);
    assert.equal(datos.reserva.modalidad, 'JORNADA');
    assert.equal(datos.reserva.precio_total, 8000);
  });

  test('una estadia que no dura 12 horas devuelve 400', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado, datos } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(11),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 400);
    assert.match(JSON.stringify(datos), /12 horas/);
  });

  test('una jornada que no dura 24 horas devuelve 400', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({ tarifas: TARIFAS });

    const { estado } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'JORNADA',
    });

    assert.equal(estado, 400);
  });

  test('una modalidad que el estacionamiento no ofrece devuelve 409', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario(); // solo por hora

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12),
      modalidad: 'ESTADIA',
    });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /ESTADIA/);
  });

  test('por hora en un estacionamiento que no la ofrece devuelve 409', async () => {
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: { tarifa_estadia: 5000 },
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, franja());

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /HORA/);
  });

  test('una estadia puede seguir despues del cierre si el ingreso esta en horario', async () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
      dia_semana,
      hora_apertura: '08:00',
      hora_cierre: '20:00',
    }));
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: TARIFAS,
      horarios,
    });

    const { estado } = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12, '18:00'),
      modalidad: 'ESTADIA',
    });

    assert.equal(estado, 201);
  });

  test('una estadia con el ingreso fuera del horario devuelve 409', async () => {
    const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
      dia_semana,
      hora_apertura: '08:00',
      hora_cierre: '20:00',
    }));
    const { conductor, estacionamiento, vehiculo } = await escenario({
      tarifas: TARIFAS,
      horarios,
    });

    const respuesta = await reservar(conductor, estacionamiento, vehiculo, {
      ...bloque(12, '22:00'),
      modalidad: 'ESTADIA',
    });

    assert.equal(respuesta.estado, 409);
    assert.match(motivo(respuesta), /fuera del horario/);
  });

  test('el precio queda guardado aunque el propietario cambie la tarifa despues', async () => {
    const { propietario, conductor, estacionamiento, vehiculo } = await escenario();

    const alta = await reservar(conductor, estacionamiento, vehiculo, franja());
    assert.equal(alta.datos.reserva.precio_total, 2000);

    const cambio = await api('PATCH', `/estacionamientos/${estacionamiento.id_estacionamiento}`, {
      token: propietario.token,
      body: { tarifa_hora: 3000 },
    });
    assert.equal(cambio.estado, 200);

    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas[0].precio_total, 2000);
  });
});
