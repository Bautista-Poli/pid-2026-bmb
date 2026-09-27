-- Datos base necesarios para operar (catalogo de tipos de vehiculo del ER).
INSERT INTO tipo_vehiculo (id_tipo_vehiculo, nombre) VALUES
  (1, 'Auto'),
  (2, 'Moto'),
  (3, 'Camioneta')
ON CONFLICT (id_tipo_vehiculo) DO NOTHING;

-- Reacomoda la secuencia de la identity despues del insert con ids explicitos.
SELECT setval(
  pg_get_serial_sequence('tipo_vehiculo', 'id_tipo_vehiculo'),
  (SELECT COALESCE(MAX(id_tipo_vehiculo), 1) FROM tipo_vehiculo)
);
