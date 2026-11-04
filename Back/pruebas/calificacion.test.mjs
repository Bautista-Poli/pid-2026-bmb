// Calificaciones del conductor y reputacion del estacionamiento (gamificacion
// "Anfitrion destacado"): solo se califica despues de entrar y salir, una vez;
// el puntaje combina calificaciones y operacion; las insignias se ven en la
// busqueda y los destacados van primero.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  api,
  cerrarApi,
  crearEstacionamiento,
  crearUsuario,
  crearVehiculo,
  franja,
  ingresoHaceUnRato,
  levantarApi,
  motivo,
  ponerEnCurso,
  query,
} from './ayuda.mjs';

before(() => levantarApi('calificacion'));
after(() => cerrarApi());

const NOTAS = { limpieza: 5, infraestructura: 4, atencion: 5, seguridad: 5, acceso: 4 };
const TODO_CINCO = { limpieza: 5, infraestructura: 5, atencion: 5, seguridad: 5, acceso: 5 };

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

const calificar = (conductor, idReserva, body = NOTAS) =>
  api('POST', `/reservas/${idReserva}/calificacion`, { token: conductor.token, body });

/** `n` conductores distintos que usan y califican el estacionamiento. */
async function calificaciones(propietario, estacionamiento, n, notas = TODO_CINCO, extra = {}) {
  for (let i = 0; i < n; i++) {
    const conductor = await crearUsuario();
    const reserva = await reservar(propietario, conductor, estacionamiento, franja('08:00', '09:00', i + 1));
    await marcarUsada(reserva.id_reserva);
    const { estado } = await calificar(conductor, reserva.id_reserva, { ...notas, ...extra });
    assert.equal(estado, 201);
  }
}

describe('calificar una reserva', () => {
  test('despues de entrar y salir con el QR: queda calificada y no se puede repetir', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);

    // Antes de usarla no se puede.
    const antes = await calificar(conductor, reserva.id_reserva);
    assert.equal(antes.estado, 409);
    assert.match(motivo(antes), /entrar y salir/);

    await ponerEnCurso(reserva.id_reserva);
    const codigo = reserva.codigo_acceso;
    assert.equal((await api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } })).estado, 200);

    // En curso (entro pero no salio) tampoco.
    const enCurso = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(enCurso.datos.reservas[0].calificable, false);
    assert.equal((await calificar(conductor, reserva.id_reserva)).estado, 409);

    await ingresoHaceUnRato(reserva.id_reserva);
    assert.equal((await api('POST', '/reservas/acceso', { token: propietario.token, body: { codigo } })).estado, 200);

    const finalizada = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(finalizada.datos.reservas[0].estado, 'FINALIZADA');
    assert.equal(finalizada.datos.reservas[0].calificable, true);
    assert.equal(finalizada.datos.reservas[0].calificacion_promedio, null);

    const { estado, datos } = await calificar(conductor, reserva.id_reserva, {
      ...NOTAS,
      etiquetas: ['muy_limpio', 'BUENA_ATENCION', 'MUY_LIMPIO'],
      comentario: '  Muy limpio y el encargado super amable.  ',
    });
    assert.equal(estado, 201);
    assert.equal(datos.calificacion.promedio, 4.6);
    assert.deepEqual(datos.calificacion.etiquetas, ['MUY_LIMPIO', 'BUENA_ATENCION']);
    assert.equal(datos.calificacion.comentario, 'Muy limpio y el encargado super amable.');

    const despues = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(despues.datos.reservas[0].calificable, false);
    assert.equal(despues.datos.reservas[0].calificacion_promedio, 4.6);

    const repetida = await calificar(conductor, reserva.id_reserva);
    assert.equal(repetida.estado, 409);
    assert.match(motivo(repetida), /Ya calificaste/);
  });

  test('solo el conductor de la reserva', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const otro = await crearUsuario();
    assert.equal((await calificar(otro, reserva.id_reserva)).estado, 403);
    // El propietario no tiene el rol de conductor.
    assert.equal((await calificar(propietario, reserva.id_reserva)).estado, 403);
  });

  test('una reserva ausente o cancelada no se califica', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await query(`UPDATE reserva SET estado = 'NO_SHOW' WHERE id_reserva = $1`, [reserva.id_reserva]);
    assert.equal((await calificar(conductor, reserva.id_reserva)).estado, 409);
  });

  test('vence a los 7 dias del egreso', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva, { egresoHace: '8 days' });

    const { datos } = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(datos.reservas[0].calificable, false);
    const vencida = await calificar(conductor, reserva.id_reserva);
    assert.equal(vencida.estado, 409);
    assert.match(motivo(vencida), /7 dias/);
  });

  test('valida las notas y las etiquetas', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);

    const sinUna = await calificar(conductor, reserva.id_reserva, { ...NOTAS, acceso: undefined });
    assert.equal(sinUna.estado, 400);
    const fueraDeRango = await calificar(conductor, reserva.id_reserva, { ...NOTAS, limpieza: 6 });
    assert.equal(fueraDeRango.estado, 400);
    const etiquetaRara = await calificar(conductor, reserva.id_reserva, { ...NOTAS, etiquetas: ['GENIAL'] });
    assert.equal(etiquetaRara.estado, 400);
  });
});

describe('reputacion del estacionamiento', () => {
  test('sin datos arranca en 85 (promedio supuesto 4) y sin insignia', async () => {
    const { propietario, estacionamiento } = await escenario();
    const { estado, datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion`,
      { token: propietario.token },
    );
    assert.equal(estado, 200);
    assert.equal(datos.dias, 30);
    assert.equal(datos.puntaje, 85); // 45 de calificaciones + 40 de operacion
    assert.equal(datos.calificaciones.puntos, 45);
    assert.equal(datos.operacion.puntos, 40);
    assert.equal(datos.destacado, false); // faltan calificaciones
    assert.equal(datos.calificaciones.cantidad, 0);
    assert.equal(datos.puntaje_anterior, null);
    assert.deepEqual(datos.insignias, []);
  });

  test('con suficientes calificaciones altas es destacado y gana las insignias de categoria', async () => {
    const { propietario, estacionamiento } = await escenario();
    await calificaciones(propietario, estacionamiento, 5, TODO_CINCO, { etiquetas: ['MUY_LIMPIO'] });

    const { datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion?dias=90`,
      { token: propietario.token },
    );
    assert.equal(datos.dias, 90);
    assert.equal(datos.calificaciones.cantidad, 5);
    assert.equal(datos.calificaciones.promedio, 5);
    assert.equal(datos.puntaje, 100);
    assert.equal(datos.destacado, true);
    const codigos = datos.insignias.map((i) => i.codigo);
    assert.deepEqual(codigos, ['DESTACADO', 'IMPECABLE', 'BUENA_INFRAESTRUCTURA', 'BUENA_ATENCION', 'SEGURO', 'FACIL_ACCESO']);
    assert.equal(datos.etiquetas.find((e) => e.codigo === 'MUY_LIMPIO').cantidad, 5);
    assert.equal(datos.opiniones.length, 5);
    assert.equal(datos.opiniones[0].autor, 'Prueba P.');
    assert.equal(datos.sugerencia, null);
  });

  test('la operacion resta: vencidas sin confirmar y cancelaciones propias', async () => {
    const { propietario, estacionamiento } = await escenario();
    const conductor = await crearUsuario();
    const usada = await reservar(propietario, conductor, estacionamiento, franja('08:00', '09:00', 1));
    await marcarUsada(usada.id_reserva);
    const vencida = await reservar(propietario, conductor, estacionamiento, franja('10:00', '11:00', 1));
    await query(
      `UPDATE reserva SET estado = 'CANCELADA', cancelada_por = 'SISTEMA',
              inicio = now() - interval '2 hours', fin = now() - interval '1 hour'
        WHERE id_reserva = $1`,
      [vencida.id_reserva],
    );

    const { datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion`,
      { token: propietario.token },
    );
    assert.equal(datos.operacion.confirmacion.reservas, 2);
    assert.equal(datos.operacion.confirmacion.vencidas, 1);
    assert.equal(datos.operacion.confirmacion.puntos, 5);
    assert.equal(datos.puntaje, 45 + 5 + 10 + 10 + 10);
  });

  test('sugiere la categoria mas floja con la etiqueta negativa mas marcada', async () => {
    const { propietario, estacionamiento } = await escenario();
    await calificaciones(propietario, estacionamiento, 2, { ...TODO_CINCO, infraestructura: 3 }, {
      etiquetas: ['POCA_ILUMINACION'],
    });

    const { datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion`,
      { token: propietario.token },
    );
    assert.equal(datos.sugerencia.categoria, 'infraestructura');
    assert.equal(datos.sugerencia.promedio, 3);
    assert.equal(datos.sugerencia.puntos, 5); // 3 * (4,5 - 3) = 4,5 -> 5
    assert.deepEqual(datos.sugerencia.etiqueta, { codigo: 'POCA_ILUMINACION', cantidad: 2 });
    const infra = datos.calificaciones.categorias.find((c) => c.codigo === 'infraestructura');
    assert.equal(infra.promedio, 3);
    assert.equal(infra.anterior, null);
  });

  test('solo la ve su propietario', async () => {
    const { estacionamiento } = await escenario();
    const otro = await crearUsuario({ rol: 'PROPIETARIO' });
    const ajena = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion`, {
      token: otro.token,
    });
    assert.equal(ajena.estado, 403);
    const periodoRaro = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion?dias=7`,
      { token: otro.token },
    );
    assert.equal(periodoRaro.estado, 400);
  });
});

describe('compatible con la tabla calificacion (puntaje y autor)', () => {
  test('guarda autor CONDUCTOR y el puntaje como promedio redondeado', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);
    await calificar(conductor, reserva.id_reserva); // promedio 4,6

    const { rows } = await query('SELECT autor::text, puntaje FROM calificacion WHERE id_reserva = $1', [
      reserva.id_reserva,
    ]);
    assert.deepEqual(rows, [{ autor: 'CONDUCTOR', puntaje: 5 }]);
  });

  test('una de solo puntaje cuenta para el promedio; las del propietario no', async () => {
    const { propietario, estacionamiento, conductor } = await escenario();
    const reserva = await reservar(propietario, conductor, estacionamiento);
    await marcarUsada(reserva.id_reserva);
    // Como la carga el otro flujo: sin categorias. Y el propietario califica al conductor.
    await query(
      `INSERT INTO calificacion (id_reserva, autor, id_estacionamiento, id_conductor, puntaje)
       VALUES ($1, 'CONDUCTOR', $2, $3, 3), ($1, 'PROPIETARIO', $2, $3, 1)`,
      [reserva.id_reserva, estacionamiento.id_estacionamiento, conductor.id],
    );

    const { datos } = await api(
      'GET',
      `/estacionamientos/${estacionamiento.id_estacionamiento}/reputacion`,
      { token: propietario.token },
    );
    assert.equal(datos.calificaciones.cantidad, 1);
    assert.equal(datos.calificaciones.promedio, 3);
    assert.equal(datos.calificaciones.categorias[0].promedio, null);
    assert.equal(datos.opiniones.length, 1);

    // Ya hay una del conductor para esa reserva: no se puede calificar de nuevo.
    const repetida = await calificar(conductor, reserva.id_reserva);
    assert.equal(repetida.estado, 409);
    const mias = await api('GET', '/reservas', { token: conductor.token });
    assert.equal(mias.datos.reservas[0].calificacion_promedio, 3);
    assert.equal(mias.datos.reservas[0].calificable, false);

    const busqueda = await api('GET', `/estacionamientos/${estacionamiento.id_estacionamiento}`);
    assert.equal(busqueda.datos.estacionamiento.calificaciones, 1);
    assert.equal(busqueda.datos.estacionamiento.calificacion_categorias, null);
  });
});

describe('insignias en la busqueda', () => {
  test('el destacado trae sus insignias, va primero y se puede filtrar', async () => {
    const { propietario, estacionamiento: destacado } = await escenario();
    await calificaciones(propietario, destacado, 5);
    const comun = await crearEstacionamiento(propietario.token);
    // Comparten un texto para buscar solo estos dos.
    const marca = `zz${crypto.randomUUID().slice(0, 6)}`;
    await query(`UPDATE estacionamiento SET descripcion = $1 WHERE id_estacionamiento = ANY($2)`, [
      marca,
      [destacado.id_estacionamiento, comun.id_estacionamiento],
    ]);
    // Que el comun vaya antes por nombre: el orden lo tiene que dar la insignia.
    await query(`UPDATE estacionamiento SET nombre = 'AAA ' || nombre WHERE id_estacionamiento = $1`, [
      comun.id_estacionamiento,
    ]);

    const { datos } = await api('GET', `/estacionamientos?q=${marca}`);
    assert.equal(datos.estacionamientos.length, 2);
    const [primero, segundo] = datos.estacionamientos;
    assert.equal(primero.id_estacionamiento, destacado.id_estacionamiento);
    assert.equal(primero.destacado, true);
    assert.equal(primero.calificaciones, 5);
    assert.equal(primero.calificacion_promedio, 5);
    assert.equal(primero.calificacion_categorias.limpieza, 5);
    assert.ok(primero.insignias.some((i) => i.codigo === 'DESTACADO'));
    assert.ok(!('prom_limpieza' in primero));

    assert.equal(segundo.destacado, false);
    assert.equal(segundo.calificaciones, 0);
    assert.equal(segundo.calificacion_promedio, null);
    assert.equal(segundo.calificacion_categorias, null);
    assert.deepEqual(segundo.insignias, []);

    const soloDestacados = await api('GET', `/estacionamientos?q=${marca}&destacados=true`);
    assert.deepEqual(
      soloDestacados.datos.estacionamientos.map((e) => e.id_estacionamiento),
      [destacado.id_estacionamiento],
    );

    const detalle = await api('GET', `/estacionamientos/${destacado.id_estacionamiento}`);
    assert.equal(detalle.datos.estacionamiento.destacado, true);
    assert.equal(detalle.datos.estacionamiento.calificaciones, 5);
  });
});
