// Completa latitud/longitud de los estacionamientos que no las tienen,
// geocodificando su direccion. Ejecutar con: npm run db:geocodificar
//
// Es idempotente: solo toca los que tienen coordenadas en NULL, asi que se
// puede volver a correr si alguno fallo. Va de a uno por segundo (limite de
// Nominatim), asi que con muchos estacionamientos tarda un rato.
import { pool, query } from '../config/database.js';
import { geocodificar } from '../services/geocodificacion.service.js';

try {
  const { rows } = await query(
    `SELECT id_estacionamiento, nombre, calle, numero, ciudad, provincia, codigo_postal
       FROM estacionamiento
      WHERE activo AND (latitud IS NULL OR longitud IS NULL)
      ORDER BY nombre`,
  );

  console.log(`[geocodificar] ${rows.length} estacionamientos sin coordenadas`);
  let completados = 0;

  for (const estacionamiento of rows) {
    const coordenadas = await geocodificar(estacionamiento);
    const etiqueta = `${estacionamiento.nombre} (${estacionamiento.calle} ${estacionamiento.numero}, ${estacionamiento.ciudad})`;

    if (!coordenadas) {
      console.log(`  ✗ ${etiqueta}: no se encontro la direccion`);
      continue;
    }

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
