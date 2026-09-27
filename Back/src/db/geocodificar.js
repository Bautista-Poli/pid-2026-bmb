// Completa latitud/longitud de los estacionamientos geocodificando su direccion.
//   npm run db:geocodificar              -> solo los que no tienen coordenadas
//   npm run db:geocodificar -- --todos   -> recalcula todos (por ejemplo, para
//                                           reemplazar las que habia dado Nominatim)
// Se puede volver a correr las veces que haga falta.
import { pool, query } from '../config/database.js';
import { geocodificar } from '../services/geocodificacion.service.js';

const todos = process.argv.includes('--todos');

try {
  const { rows } = await query(
    `SELECT id_estacionamiento, nombre, calle, numero, ciudad, provincia
       FROM estacionamiento
      WHERE activo ${todos ? '' : 'AND (latitud IS NULL OR longitud IS NULL)'}
      ORDER BY nombre`,
  );

  console.log(`[geocodificar] ${rows.length} estacionamientos ${todos ? 'en total' : 'sin coordenadas'}`);
  let completados = 0;

  for (const estacionamiento of rows) {
    const resultado = await geocodificar(estacionamiento);
    const etiqueta = `${estacionamiento.nombre} (${estacionamiento.calle} ${estacionamiento.numero}, ${estacionamiento.ciudad}, ${estacionamiento.provincia})`;

    if (resultado?.latitud == null) {
      const motivo =
        resultado?.encontrada === false
          ? 'Georef no conoce esa direccion: editala desde la app eligiendo de la lista'
          : 'no se pudo obtener la ubicacion';
      console.log(`  ✗ ${etiqueta}: ${motivo}`);
      continue;
    }
    const coordenadas = resultado;

    await query(
      'UPDATE estacionamiento SET latitud = $1, longitud = $2 WHERE id_estacionamiento = $3',
      [coordenadas.latitud, coordenadas.longitud, estacionamiento.id_estacionamiento],
    );
    completados++;
    console.log(`  ✓ ${etiqueta}: ${coordenadas.latitud}, ${coordenadas.longitud}`);
  }

  console.log(`[geocodificar] listo: ${completados}/${rows.length} completados`);
} catch (error) {
  console.error('[geocodificar] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
