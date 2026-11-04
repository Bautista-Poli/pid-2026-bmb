// Herramienta para probar la reputacion: carga conductores de demo que ya
// usaron (entraron y salieron) un estacionamiento y lo calificaron, asi se ve
// el puntaje, las insignias y "Anfitrion destacado" sin juntar calificaciones reales.
//   npm run db:calificaciones-demo -- "Garage Centro"          (6 calificaciones altas)
//   npm run db:calificaciones-demo -- "Garage Centro" 3 bajas  (3 calificaciones flojas)
//   npm run db:calificaciones-demo -- --presentacion            (4 perfiles armados, ver PERFILES)
//   npm run db:calificaciones-demo -- --presentacion "A" "B"    (los perfiles en esos, en orden)
//   npm run db:calificaciones-demo -- --borrar                  (saca todo lo de demo)
// El estacionamiento se busca por nombre (o por su id). Los usuarios de demo
// tienen email @demo.parkit y no pueden iniciar sesion (contrasena invalida).
import { pool, withTransaction } from '../config/database.js';

const DOMINIO = 'demo.parkit';
const NOMBRES = [
  ['Lucia', 'Paz'], ['Martin', 'Gomez'], ['Sofia', 'Ruiz'], ['Diego', 'Lopez'],
  ['Valentina', 'Diaz'], ['Tomas', 'Fernandez'], ['Camila', 'Sosa'], ['Juan', 'Perez'],
  ['Martina', 'Romero'], ['Nicolas', 'Alvarez'], ['Julieta', 'Torres'], ['Federico', 'Acosta'],
  ['Agustina', 'Medina'], ['Lucas', 'Herrera'], ['Florencia', 'Castro'], ['Mateo', 'Rios'],
];
const ALTAS = [
  { notas: [5, 5, 5, 5, 5], etiquetas: ['MUY_LIMPIO', 'BUENA_ATENCION'], comentario: 'Muy limpio y el encargado super amable.' },
  { notas: [5, 4, 5, 5, 4], etiquetas: ['SEGURO'], comentario: null },
  { notas: [5, 4, 5, 4, 5], etiquetas: ['FACIL_DE_LLEGAR', 'MUY_LIMPIO'], comentario: 'Bien ubicado, entre y sali sin problema.' },
  { notas: [4, 3, 5, 5, 4], etiquetas: ['POCA_ILUMINACION'], comentario: 'Todo bien, pero de noche el fondo esta oscuro.' },
];
const BAJAS = [
  { notas: [2, 2, 3, 3, 2], etiquetas: ['POCA_LIMPIEZA', 'DIFICIL_DE_MANIOBRAR'], comentario: 'Sucio y muy justo para maniobrar.' },
  { notas: [3, 2, 2, 3, 3], etiquetas: ['POCA_ILUMINACION'], comentario: 'Nadie atendia y estaba oscuro.' },
];

const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));

async function borrar() {
  const usuarios = `SELECT id_usuario FROM usuario WHERE email LIKE '%@${DOMINIO}'`;
  await pool.query(`DELETE FROM reserva WHERE id_conductor IN (${usuarios})`);
  const { rowCount } = await pool.query(`DELETE FROM usuario WHERE email LIKE '%@${DOMINIO}'`);
  console.log(`[demo] borrados ${rowCount} conductores de demo con sus reservas y calificaciones`);
}

/**
 * Perfiles para mostrar en la presentacion. `calificaciones`: [hace cuantos
 * dias, notas (limpieza, infraestructura, atencion, seguridad, acceso),
 * etiquetas, comentario]. Las de hace mas de 30 dias caen en el periodo
 * anterior: con "Ultimos 30 dias" se ve la tendencia. `vencidas` y
 * `canceladasPorElDueno` restan en la parte de operacion.
 */
const PERFILES = [
  {
    nombre: 'Anfitrion destacado',
    calificaciones: [
      [1, [5, 5, 5, 5, 5], ['MUY_LIMPIO', 'BUENA_ATENCION'], 'Impecable, y el encargado super amable.'],
      [2, [5, 5, 5, 5, 5], ['SEGURO'], null],
      [4, [5, 4, 5, 5, 5], ['FACIL_DE_LLEGAR'], 'Entre y sali en un minuto.'],
      [6, [5, 5, 5, 5, 4], ['MUY_LIMPIO'], null],
      [9, [5, 5, 5, 4, 5], ['BIEN_ILUMINADO', 'SEGURO'], 'Muy bien iluminado, deje el auto tranquilo.'],
      [12, [5, 4, 5, 5, 5], [], null],
      [16, [5, 5, 4, 5, 5], ['BUENA_ATENCION'], 'Me ayudaron a estacionar.'],
      [21, [5, 5, 5, 5, 5], ['MUY_LIMPIO', 'SEGURO'], null],
      [35, [4, 4, 5, 4, 4], [], 'Bien, aunque la rampa es angosta.'],
      [42, [4, 4, 4, 5, 4], ['SEGURO'], null],
      [50, [5, 4, 4, 4, 4], [], null],
    ],
    vencidas: 0,
    canceladasPorElDueno: 0,
  },
  {
    // Buen puntaje pero todavia pocas calificaciones: "te falta 1 calificacion".
    nombre: 'Casi destacado',
    calificaciones: [
      [2, [5, 4, 5, 5, 4], ['SEGURO'], 'Todo en orden.'],
      [5, [5, 5, 4, 5, 5], ['MUY_LIMPIO'], null],
      [10, [4, 4, 5, 5, 5], ['BUENA_ATENCION'], 'Muy buena atencion.'],
      [18, [5, 4, 5, 4, 5], [], null],
    ],
    vencidas: 0,
    canceladasPorElDueno: 0,
  },
  {
    // La infraestructura tira para abajo (sugerencia) y dejo vencer reservas.
    nombre: 'A mejorar',
    calificaciones: [
      [1, [4, 2, 4, 4, 4], ['POCA_ILUMINACION'], 'De noche el subsuelo esta muy oscuro.'],
      [3, [5, 3, 4, 4, 4], ['POCA_ILUMINACION'], null],
      [6, [4, 2, 5, 4, 3], ['POCA_ILUMINACION', 'DIFICIL_DE_MANIOBRAR'], 'Columnas en el medio, cuesta maniobrar.'],
      [9, [4, 3, 4, 4, 4], [], null],
      [14, [5, 3, 4, 5, 4], ['BUENA_ATENCION'], 'Buena atencion, pero falta luz.'],
      [20, [4, 2, 4, 4, 4], ['POCA_ILUMINACION'], null],
      [40, [4, 3, 4, 4, 4], [], null],
    ],
    vencidas: 3,
    canceladasPorElDueno: 1,
  },
  {
    nombre: 'Puntaje bajo',
    calificaciones: [
      [2, [2, 2, 2, 3, 2], ['POCA_LIMPIEZA', 'DIFICIL_DE_MANIOBRAR'], 'Sucio y muy justo para maniobrar.'],
      [4, [3, 2, 1, 3, 2], ['POCA_ILUMINACION'], 'Nadie atendia y estaba oscuro.'],
      [8, [2, 3, 2, 2, 3], ['POCA_LIMPIEZA'], null],
      [13, [3, 2, 2, 3, 2], [], 'Me cancelaron la reserva el mismo dia.'],
      [19, [2, 2, 3, 2, 2], ['DIFICIL_DE_MANIOBRAR'], null],
    ],
    vencidas: 2,
    canceladasPorElDueno: 2,
  },
];

let indiceNombre = 0;

/** Conductor de demo con su vehiculo. */
async function conductorDemo(client, idTipoVehiculo) {
  const [nombre, apellido] = NOMBRES[indiceNombre++ % NOMBRES.length];
  const sufijo = crypto.randomUUID().slice(0, 8);
  const { rows: [usuario] } = await client.query(
    `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, roles)
     VALUES ($1, $2, $3, '!demo', 'CONDUCTOR', ARRAY['CONDUCTOR']::rol_usuario[])
     RETURNING id_usuario`,
    [nombre, apellido, `${sufijo}@${DOMINIO}`],
  );
  const { rows: [vehiculo] } = await client.query(
    `INSERT INTO vehiculo (id_conductor, id_tipo_vehiculo, patente)
     VALUES ($1, $2, $3) RETURNING id_vehiculo`,
    [usuario.id_usuario, idTipoVehiculo, `DM${sufijo.slice(0, 6).toUpperCase()}`],
  );
  return { idConductor: usuario.id_usuario, idVehiculo: vehiculo.id_vehiculo };
}

/** Reserva usada (entro y salio) hace `dias` dias, de 10 a 12 h, calificada. */
async function calificacionDemo(client, lugar, { dias, notas, etiquetas, comentario }) {
  const { idConductor, idVehiculo } = await conductorDemo(client, lugar.id_tipo_vehiculo);
  const { rows: [reserva] } = await client.query(
    `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado,
                          ingreso_real, egreso_real, precio_total)
     VALUES ($1, $2, $3,
             date_trunc('day', now()) - make_interval(days => $4) + interval '10 hours',
             date_trunc('day', now()) - make_interval(days => $4) + interval '12 hours',
             'FINALIZADA',
             date_trunc('day', now()) - make_interval(days => $4) + interval '10 hours 3 minutes',
             date_trunc('day', now()) - make_interval(days => $4) + interval '11 hours 50 minutes',
             0)
     RETURNING id_reserva`,
    [idConductor, idVehiculo, lugar.id_cochera, dias],
  );
  await client.query(
    `INSERT INTO calificacion (id_reserva, autor, id_conductor, id_estacionamiento, puntaje,
                               limpieza, infraestructura, atencion, seguridad, acceso,
                               etiquetas, comentario, created_at)
     VALUES ($1, 'CONDUCTOR', $2, $3, $12, $4, $5, $6, $7, $8, $9, $10,
             date_trunc('day', now()) - make_interval(days => $11) + interval '12 hours')`,
    [
      reserva.id_reserva, idConductor, lugar.id_estacionamiento, ...notas, etiquetas, comentario, dias,
      Math.round(notas.reduce((a, b) => a + b, 0) / notas.length),
    ],
  );
}

/** Reserva cancelada hace `dias` dias: por el SISTEMA (vencio sin confirmar) o por el PROPIETARIO. */
async function canceladaDemo(client, lugar, dias, canceladaPor) {
  const { idConductor, idVehiculo } = await conductorDemo(client, lugar.id_tipo_vehiculo);
  await client.query(
    `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado, cancelada_por, precio_total)
     VALUES ($1, $2, $3,
             date_trunc('day', now()) - make_interval(days => $4) + interval '15 hours',
             date_trunc('day', now()) - make_interval(days => $4) + interval '17 hours',
             'CANCELADA', $5, 0)`,
    [idConductor, idVehiculo, lugar.id_cochera, dias, canceladaPor],
  );
}

async function buscarLugar(client, busqueda) {
  const { rows } = await client.query(
    `SELECT e.id_estacionamiento, e.nombre, c.id_cochera, c.id_tipo_vehiculo
       FROM estacionamiento e
       JOIN cochera c ON c.id_estacionamiento = e.id_estacionamiento AND c.activo
      WHERE e.id_estacionamiento::text = $1 OR e.nombre ILIKE $2
      ORDER BY e.nombre, c.identificador
      LIMIT 1`,
    [busqueda, `%${busqueda}%`],
  );
  if (!rows[0]) throw new Error(`No hay ningun estacionamiento con cocheras que se llame "${busqueda}"`);
  return rows[0];
}

async function cargar(busqueda, cantidad, tanda) {
  await withTransaction(async (client) => {
    const lugar = await buscarLugar(client, busqueda);
    for (let i = 0; i < cantidad; i++) {
      const { notas, etiquetas, comentario } = tanda[i % tanda.length];
      await calificacionDemo(client, lugar, { dias: i + 1, notas, etiquetas, comentario });
    }
    console.log(`[demo] ${cantidad} calificaciones cargadas en "${lugar.nombre}"`);
  });
}

/**
 * Un perfil por estacionamiento: los nombrados, en orden, o si no los primeros
 * aprobados y publicados (por nombre). Antes borra la demo anterior.
 */
async function presentacion(nombres) {
  await borrar();
  await withTransaction(async (client) => {
    let lugares;
    if (nombres.length > 0) {
      lugares = [];
      for (const nombre of nombres.slice(0, PERFILES.length)) lugares.push(await buscarLugar(client, nombre));
    } else {
      const { rows } = await client.query(
        `SELECT DISTINCT ON (e.nombre) e.id_estacionamiento, e.nombre, c.id_cochera, c.id_tipo_vehiculo
           FROM estacionamiento e
           JOIN cochera c ON c.id_estacionamiento = e.id_estacionamiento AND c.activo
          WHERE e.activo AND e.publicado AND e.estado_aprobacion = 'APROBADO'
          ORDER BY e.nombre, c.identificador
          LIMIT $1`,
        [PERFILES.length],
      );
      lugares = rows;
    }
    if (lugares.length === 0) throw new Error('No hay estacionamientos aprobados con cocheras');

    for (const [i, lugar] of lugares.entries()) {
      const perfil = PERFILES[i];
      for (const [dias, notas, etiquetas, comentario] of perfil.calificaciones) {
        await calificacionDemo(client, lugar, { dias, notas, etiquetas, comentario });
      }
      for (let v = 0; v < perfil.vencidas; v++) await canceladaDemo(client, lugar, 3 + v * 5, 'SISTEMA');
      for (let c = 0; c < perfil.canceladasPorElDueno; c++) {
        await canceladaDemo(client, lugar, 2 + c * 6, 'PROPIETARIO');
      }
      console.log(`[demo] "${lugar.nombre}" -> ${perfil.nombre} (${perfil.calificaciones.length} calificaciones)`);
    }
  });
}

try {
  if (process.argv.includes('--borrar')) {
    await borrar();
  } else if (process.argv.includes('--presentacion')) {
    await presentacion(argumentos);
  } else {
    const [busqueda, cantidad = '6', tipo = 'altas'] = argumentos;
    if (!busqueda) {
      console.error(
        'Uso: npm run db:calificaciones-demo -- "<nombre o id>" [cantidad] [altas|bajas]' +
          '  |  -- --presentacion ["nombre" ...]  |  -- --borrar',
      );
      process.exitCode = 1;
    } else {
      await cargar(busqueda, Math.max(1, Number(cantidad) || 6), tipo === 'bajas' ? BAJAS : ALTAS);
    }
  }
} catch (error) {
  console.error(`[demo] ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
