-- COCHERA: cada lugar de un estacionamiento, con el tipo de vehiculo que admite.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_cochera') THEN
    CREATE TYPE estado_cochera AS ENUM ('LIBRE', 'OCUPADA', 'RESERVADA', 'INACTIVA');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS cochera (
  id_cochera         UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estacionamiento UUID           NOT NULL,
  id_tipo_vehiculo   SMALLINT       NOT NULL,
  identificador      VARCHAR(20)    NOT NULL,
  -- Ubicacion en lenguaje natural ("Primer piso").
  sector             VARCHAR(40),
  cubierta           BOOLEAN        NOT NULL DEFAULT FALSE,
  -- Estado fisico: lo cambia solo el ciclo de la reserva (ingreso/egreso).
  estado_actual      estado_cochera NOT NULL DEFAULT 'LIBRE',
  activo             BOOLEAN        NOT NULL DEFAULT TRUE,

  -- Bloqueo por mantenimiento o uso interno. Separado de `estado_actual` para
  -- que el ciclo de la reserva no lo pise. `bloqueada_hasta` NULL = indefinido.
  bloqueada          BOOLEAN        NOT NULL DEFAULT FALSE,
  motivo_bloqueo     VARCHAR(300),
  bloqueada_hasta    TIMESTAMPTZ,

  CONSTRAINT cochera_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE CASCADE,
  CONSTRAINT cochera_tipo_fk
    FOREIGN KEY (id_tipo_vehiculo) REFERENCES tipo_vehiculo (id_tipo_vehiculo) ON DELETE RESTRICT,
  CONSTRAINT cochera_identificador_unico UNIQUE (id_estacionamiento, identificador)
);

CREATE INDEX IF NOT EXISTS idx_cochera_estacionamiento ON cochera (id_estacionamiento);
