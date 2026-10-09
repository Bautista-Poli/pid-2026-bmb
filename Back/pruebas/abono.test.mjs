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
