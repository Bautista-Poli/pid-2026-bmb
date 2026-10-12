// Crea un Administrador de plataforma. Es la unica forma de tener uno: no se
// puede elegir al registrarse ni agregarse desde el perfil.
//
// Uso: npm run db:crear-admin -- --email admin@parkit.com --nombre Ana --apellido Perez
// La contrasena se pide por consola (no va en los argumentos, asi no queda en
// el historial de la terminal).
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import bcrypt from 'bcrypt';

import { pool } from '../config/database.js';
import { config } from '../config/env.js';
import { campos } from '../validators/helpers.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nombre: { type: 'string' },
    apellido: { type: 'string' },
  },
});

// Una sola interfaz y una cola de lineas: asi anda igual tipeando en la
// terminal que con la entrada redirigida (las lineas pueden llegar antes que
// la pregunta).
const consola = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lineas = [];
const esperando = [];
consola.on('line', (linea) => (esperando.length ? esperando.shift()(linea) : lineas.push(linea)));
consola.on('close', () => esperando.splice(0).forEach((resolver) => resolver('')));

// Mientras se tipea una contrasena no se muestra nada.
let ocultar = false;
const escribir = consola._writeToOutput?.bind(consola);
if (escribir) {
  consola._writeToOutput = (texto) => {
    if (!ocultar) escribir(texto);
  };
}

/** Muestra la pregunta y espera la proxima linea. Con `oculto`, no la repite en pantalla. */
async function preguntar(texto, { oculto = false } = {}) {
  process.stdout.write(texto);
  ocultar = oculto;
  const respuesta = lineas.length ? lineas.shift() : await new Promise((r) => esperando.push(r));
  ocultar = false;
  if (oculto) process.stdout.write('\n');
  return respuesta;
}

async function crearAdmin() {
  const { email, nombre, apellido } = values;
  if (!email || !nombre || !apellido) {
    throw new Error('Faltan datos. Uso: npm run db:crear-admin -- --email X --nombre X --apellido X');
  }

  // Las mismas reglas que el registro: con un email sin formato no podria
  // iniciar sesion (el login tambien lo valida).
  const { valores, errores } = campos({ email, nombre, apellido })
    .email('email', email)
    .texto('nombre', nombre, { min: 2, max: 80 })
    .texto('apellido', apellido, { min: 2, max: 80 })
    .resultado();
  if (errores.length > 0) {
    throw new Error(errores.map((e) => `${e.campo} ${e.mensaje}`).join('; '));
  }

  const correo = valores.email;
  const { rows: existentes } = await pool.query('SELECT 1 FROM usuario WHERE email = $1', [correo]);
  if (existentes[0]) throw new Error(`Ya existe un usuario con el email ${correo}`);

  // La base a la que se va a escribir, para no crear un admin en la equivocada.
  const host = new URL(config.db.url).host;
  const confirmar = await preguntar(`Crear el administrador ${correo} en ${host}? (s/N) `);
  if (confirmar.trim().toLowerCase() !== 's') {
    console.log('[crear-admin] cancelado');
    return;
  }

  const password = await preguntar('Contrasena (minimo 8): ', { oculto: true });
  const repetida = await preguntar('Repetir contrasena: ', { oculto: true });
  if (password.length < 8 || password.length > 72) throw new Error('La contrasena tiene que tener entre 8 y 72 caracteres');
  if (password !== repetida) throw new Error('Las contrasenas no coinciden');

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  await pool.query(
    `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, roles)
     VALUES ($1, $2, $3, $4, 'ADMINISTRADOR', ARRAY['ADMINISTRADOR']::rol_usuario[])`,
    [valores.nombre, valores.apellido, correo, hash],
  );
  console.log(`[crear-admin] listo: ${correo}`);
}

try {
  await crearAdmin();
} catch (error) {
  console.error('[crear-admin] fallo:', error.message);
  process.exitCode = 1;
} finally {
  consola.close();
  await pool.end();
}
