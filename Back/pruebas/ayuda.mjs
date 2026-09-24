// Utilidades que comparten las pruebas.
//
// Cada archivo levanta la API en un puerto libre dentro del mismo proceso, asi
// `npm test` no necesita que haya un servidor corriendo aparte. La base es la
// de DATABASE_URL: son pruebas de integracion, no unitarias.
//
// Todo lo que crean las pruebas cuelga de usuarios con un email
// `...@<suite>.prueba.parkit`, y al terminar se borra con ese filtro. Por eso
// cada archivo pasa su propio `suite`: aunque corran en paralelo, ninguno
// limpia los datos del otro.
process.env.NODE_ENV ??= 'test';

import { once } from 'node:events';

import app from '../src/app.js';
import { pool, query } from '../src/config/database.js';

export { query };

/** Contrasena de todos los usuarios de prueba. */
export const PASSWORD = 'prueba1234';

let servidor;
let base = '';
let dominio = '';

export async function levantarApi(suite) {
  dominio = `${suite}.prueba.parkit`;
  servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  base = `http://127.0.0.1:${servidor.address().port}/api`;
}

export async function cerrarApi() {
  await borrarDatosDePrueba();
  await new Promise((resolver) => servidor.close(resolver));
  await pool.end();
}

/**
 * Devuelve `{ estado, datos }`; nunca lanza por un 4xx.
 *
 * `body` se manda como JSON, salvo que venga `raw`: un Buffer que se manda tal
 * cual, con el `contentType` indicado (asi se prueba la subida de fotos, que
 * la API espera como body binario y no como JSON).
 *
 * La sesion viaja en la cookie httpOnly que pone `/auth/login` (ver
 * `middlewares/auth.js`), asi que `token` aca es el par `nombre=valor` de esa
 * cookie (lo que devuelve `cookieDeSesion`), no el JWT crudo.
 */
export async function api(metodo, ruta, { token, body, raw, contentType } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(raw ? { 'Content-Type': contentType } : body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Cookie: token } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });

  const binario = (respuesta.headers.get('content-type') ?? '').startsWith('image/');
  const texto = binario ? null : await respuesta.text();
  let datos = binario ? Buffer.from(await respuesta.arrayBuffer()) : null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = texto;
    }
  }

  return { estado: respuesta.status, datos, headers: respuesta.headers };
}

/** El par `nombre=valor` de la cookie de sesion que puso una respuesta de `/auth`. */
export function cookieDeSesion(respuesta) {
  const crudo = respuesta.headers.getSetCookie?.()[0] ?? respuesta.headers.get('set-cookie');
  return crudo ? crudo.split(';')[0] : null;
}

/** El mensaje de error de una respuesta, para afirmar sobre el motivo. */
export const motivo = (respuesta) => respuesta.datos?.error?.message ?? '';

/**
 * Registra un usuario nuevo. Con `roles` habilita varios perfiles y deja la
 * sesion en el primero.
 */
export async function crearUsuario({ rol = 'CONDUCTOR', roles } = {}) {
  const email = `${crypto.randomUUID()}@${dominio}`;

  const alta = await api('POST', '/auth/register', {
    body: { nombre: 'Prueba', apellido: 'Parkit', email, password: PASSWORD, rol },
  });

  const usuario = { id: alta.datos.usuario.id_usuario, email, token: cookieDeSesion(alta) };

  if (roles) {
    const cambio = await api('PATCH', '/auth/me', { token: usuario.token, body: { roles } });
    usuario.token = cookieDeSesion(cambio);
  }

  return usuario;
}

/** Cambia el perfil activo y devuelve la cookie de sesion nueva. */
export async function cambiarRol(token, rol) {
  const respuesta = await api('POST', '/auth/rol', { token, body: { rol } });
  return cookieDeSesion(respuesta);
}

/** Estacionamiento publicado, abierto toda la semana, con `cocheras` cocheras. */
export async function crearEstacionamiento(
  token,
  { cocheras = 1, tipo = 1, horarios, tarifas = { tarifa_hora: 1000 } } = {},
) {
  const alta = await api('POST', '/estacionamientos', {
    token,
    body: {
      nombre: `Estacionamiento ${crypto.randomUUID().slice(0, 8)}`,
      calle: 'Av. Prueba',
      numero: '100',
      ciudad: 'CABA',
      provincia: 'Buenos Aires',
      ...tarifas,
      publicado: true,
      horarios:
        horarios ??
        [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({
          dia_semana,
          hora_apertura: '00:00',
          hora_cierre: '23:59',
        })),
    },
  });

  const estacionamiento = alta.datos.estacionamiento;

  for (let i = 1; i <= cocheras; i++) {
    await api('POST', `/estacionamientos/${estacionamiento.id_estacionamiento}/cocheras`, {
      token,
      body: { identificador: `P-${i}`, id_tipo_vehiculo: tipo },
    });
  }

  return estacionamiento;
}

export async function crearVehiculo(token, { tipo = 1 } = {}) {
  const patente = `PR${String(Math.random()).slice(2, 8)}`;
  const { datos } = await api('POST', '/vehiculos', {
    token,
    body: { patente, id_tipo_vehiculo: tipo },
  });
  return datos.vehiculo;
}

/** Una franja de manana en hora argentina, que siempre esta en el futuro. */
export function franja(horaDesde = '08:00', horaHasta = '10:00', diasAdelante = 1) {
  const dia = new Date(Date.now() + diasAdelante * 86_400_000).toISOString().slice(0, 10);
  return { inicio: `${dia}T${horaDesde}:00-03:00`, fin: `${dia}T${horaHasta}:00-03:00` };
}

/** Dia de la semana (0 = domingo) de un instante, en hora argentina. */
export function diaSemanaDe(instante) {
  return new Date(instante).getUTCDay();
}

/**
 * Adelanta una reserva para que su franja este transcurriendo ahora: es la
 * unica forma de probar el ingreso sin esperar a que llegue la hora.
 */
export function ponerEnCurso(idReserva) {
  return query(
    `UPDATE reserva
        SET inicio = now() - interval '5 minutes', fin = now() + interval '55 minutes'
      WHERE id_reserva = $1`,
    [idReserva],
  );
}

/** Borra lo que creo la suite, respetando el orden de las claves foraneas. */
async function borrarDatosDePrueba() {
  const deLaSuite = `%@${dominio}`;
  const usuarios = 'SELECT id_usuario FROM usuario WHERE email LIKE $1';
  const propios = `SELECT id_estacionamiento FROM estacionamiento WHERE id_propietario IN (${usuarios})`;

  await query(
    `DELETE FROM reserva
      WHERE id_conductor IN (${usuarios})
         OR id_cochera IN (SELECT id_cochera FROM cochera WHERE id_estacionamiento IN (${propios}))`,
    [deLaSuite],
  );
  await query(`DELETE FROM vehiculo WHERE id_conductor IN (${usuarios})`, [deLaSuite]);
  await query(`DELETE FROM horario WHERE id_estacionamiento IN (${propios})`, [deLaSuite]);
  await query(`DELETE FROM cochera WHERE id_estacionamiento IN (${propios})`, [deLaSuite]);
  await query(`DELETE FROM estacionamiento WHERE id_propietario IN (${usuarios})`, [deLaSuite]);
  await query('DELETE FROM usuario WHERE email LIKE $1', [deLaSuite]);
}
