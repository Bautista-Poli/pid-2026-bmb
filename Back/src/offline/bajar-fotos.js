// Baja de Cloudinary a datos-locales/fotos todas las fotos que referencia la base local
// (npm run offline:fotos; necesita internet). Las que ya estan no se vuelven a bajar.
import { pool } from '../config/database.js';
import * as local from '../services/fotos-locales.service.js';
import { fallo } from './comun.js';

const EN_PARALELO = 6;

/** La original (sin transformaciones); si no es jpg/png/webp, se pide convertida a jpg. */
async function bajar(nube, publicId) {
  for (const sufijo of ['', '.jpg']) {
    const respuesta = await fetch(`https://res.cloudinary.com/${nube}/image/upload/${publicId}${sufijo}`);
    if (respuesta.status === 404) return 'no-esta';
    if (!respuesta.ok) throw new Error(`Cloudinary respondio ${respuesta.status} para ${publicId}`);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    if (local.formatoDe(bytes) && bytes.length <= local.MAX_BYTES) {
      await local.guardar(publicId, bytes);
      return 'bajada';
    }
  }
  throw new Error(`${publicId} no es una imagen JPG, PNG o WEBP de hasta 5 MB`);
}

try {
  const nube = process.env.CLOUDINARY_CLOUD_NAME;
  if (!nube) throw new Error('Falta CLOUDINARY_CLOUD_NAME en Back/.env (el cloud name de produccion).');

  const { rows } = await pool.query(
    `SELECT public_id FROM estacionamiento_imagen WHERE public_id IS NOT NULL
     UNION
     SELECT foto_public_id FROM vehiculo WHERE foto_public_id IS NOT NULL`,
  );
  const pendientes = [];
  for (const { public_id: publicId } of rows) {
    if (!(await local.buscar(publicId))) pendientes.push(publicId);
  }
  console.log(`[offline] ${rows.length} fotos en la base, ${pendientes.length} para bajar`);

  const cuenta = { bajada: 0, 'no-esta': 0, error: 0 };
  // De a EN_PARALELO a la vez: cada "hilo" va tomando la siguiente de la lista.
  await Promise.all(
    Array.from({ length: EN_PARALELO }, async () => {
      for (let publicId = pendientes.shift(); publicId; publicId = pendientes.shift()) {
        try {
          cuenta[await bajar(nube, publicId)] += 1;
        } catch (error) {
          cuenta.error += 1;
          console.error(`[offline] ${error.message}`);
        }
      }
    }),
  );
  console.log(`[offline] bajadas ${cuenta.bajada}, no estaban en Cloudinary ${cuenta['no-esta']}, con error ${cuenta.error}`);
  if (cuenta.error > 0) process.exitCode = 1;
} catch (error) {
  fallo(error);
} finally {
  await pool.end();
}
