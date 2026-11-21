-- ABONOS por turno. No son reservas anticipadas: el conductor paga por
-- adelantado un cupo de usos en un turno y despues reserva gratis dentro de
-- ese turno. Cada reserva con abono descuenta un uso. Los usos consumidos no se
-- guardan: son las reservas del abono que no estan CANCELADAS.

/* LOS DO BEGIN SON CONDICIONALES QUE EN CASO DE FALTAR, CREAN EN pg_type
EL TIPO DE VALORES QUE PUEDE UNA COLUMNA ACEPTAR */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turno_abono') THEN
    CREATE TYPE turno_abono AS ENUM ('MANANA', 'TARDE', 'NOCHE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_abono') THEN
    CREATE TYPE estado_abono AS ENUM ('VIGENTE', 'CANCELADO', 'VENCIDO');
    /*
    ALTER TYPE estado_abono ADD VALUE IF NOT EXISTS '...';
    */
  END IF;
END
$$;

-- PLAN_ABONO: lo que ofrece el propietario. Un plan activo por turno.
CREATE TABLE IF NOT EXISTS plan_abono (
  id_plan            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estacionamiento UUID           NOT NULL,
  turno              turno_abono    NOT NULL,
  cupos              SMALLINT       NOT NULL,
  precio             DECIMAL(10, 2) NOT NULL,
  activo             BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT plan_abono_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE CASCADE,
  CONSTRAINT plan_abono_cupos_positivos CHECK (cupos > 0),
  CONSTRAINT plan_abono_precio_no_negativo CHECK (precio >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_abono_un_activo_por_turno
  ON plan_abono (id_estacionamiento, turno) WHERE activo;

-- ABONO: lo que compro el conductor. Turno, cupos y precio se copian del plan
-- al comprar, para que un cambio posterior del plan no altere lo ya vendido.
CREATE TABLE IF NOT EXISTS abono (
  id_abono           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conductor       UUID           NOT NULL,
  id_estacionamiento UUID           NOT NULL,
  id_plan            UUID           NOT NULL,
  turno              turno_abono    NOT NULL,
  cupos_totales      SMALLINT       NOT NULL,
  precio_total       DECIMAL(10, 2) NOT NULL,
  desde              DATE           NOT NULL,
  hasta              DATE           NOT NULL,
  estado             estado_abono   NOT NULL DEFAULT 'VIGENTE',
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT abono_conductor_fk
    FOREIGN KEY (id_conductor) REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
  CONSTRAINT abono_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE RESTRICT,
  CONSTRAINT abono_plan_fk
    FOREIGN KEY (id_plan) REFERENCES plan_abono (id_plan) ON DELETE RESTRICT,
  CONSTRAINT abono_cupos_positivos CHECK (cupos_totales > 0),
  CONSTRAINT abono_rango_valido CHECK (hasta >= desde)
);

CREATE INDEX IF NOT EXISTS idx_abono_conductor       ON abono (id_conductor);
CREATE INDEX IF NOT EXISTS idx_abono_estacionamiento ON abono (id_estacionamiento);
