// Pasa a Cloudinary las fotos de estacionamientos que todavia estan como
// bytes en la base, y libera esos bytes. Se puede cortar y volver a correr:
// solo toma las que no tienen public_id.
//
// Uso: npm run db:migrar-fotos-cloudinary        (con Back/.env)
//      npm run db:migrar-fotos-cloudinary:prod   (con las variables del entorno)
import { pool } from '../config/database.js';
import { config } from '../config/env.js';
import { carpetaDe, subirBytes } from '../services/cloudinary.service.js';

async function migrar() {
  if (!config.cloudinary.habilitada) {
    throw new Error('Faltan las variables CLOUDINARY_* (o CLOUDINARY_ENABLED=false)');
  }

  const { rows: pendientes } = await pool.query(
    `SELECT id_imagen, id_estacionamiento
       FROM estacionamiento_imagen
      WHERE public_id IS NULL AND bytes IS NOT NULL
      ORDER BY id_estacionamiento, orden`,
  );
  console.log(`[migrar-fotos] ${pendientes.length} foto(s) para subir a ${config.cloudinary.carpeta}/`);

  let subidas = 0;
  for (const { id_imagen: idImagen, id_estacionamiento: idEstacionamiento } of pendientes) {
    // Los bytes se leen de a una foto, para no traer todas a memoria juntas.
    const { rows } = await pool.query('SELECT bytes FROM estacionamiento_imagen WHERE id_imagen = $1', [idImagen]);
    try {
      const publicId = await subirBytes(rows[0].bytes, carpetaDe('estacionamientos', idEstacionamiento));
      await pool.query(
        `UPDATE estacionamiento_imagen SET public_id = $2, bytes = NULL, mime = NULL
          WHERE id_imagen = $1 AND public_id IS NULL`,
        [idImagen, publicId],
      );
      subidas += 1;
    } catch (error) {
      console.error(`[migrar-fotos] no se pudo subir ${idImagen}:`, error.message ?? error);
    }
  }

  console.log(`[migrar-fotos] listo: ${subidas} de ${pendientes.length}`);
  if (subidas < pendientes.length) process.exitCode = 1;
}

try {
  await migrar();
} catch (error) {
  console.error('[migrar-fotos] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
