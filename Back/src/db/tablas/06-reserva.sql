-- RESERVA de una cochera para un vehiculo en una franja horaria.
--
-- Ciclo: PENDIENTE -> CONFIRMADA -> (ingreso) ACTIVA -> (egreso) FINALIZADA.
-- Ademas: CANCELADA (por el conductor, el propietario o el sistema) y NO_SHOW
-- (CONFIRMADA sin ingreso pasada la tolerancia). Las transiciones estan en
-- services/reserva/reserva-estados.js.

-- btree_gist habilita los EXCLUDE que evitan reservas solapadas.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_reserva') THEN
    CREATE TYPE estado_reserva AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'FINALIZADA', 'ACTIVA', 'NO_SHOW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modalidad_reserva') THEN
    CREATE TYPE modalidad_reserva AS ENUM ('HORA', 'ESTADIA', 'JORNADA', 'ABONO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'origen_cancelacion') THEN
    CREATE TYPE origen_cancelacion AS ENUM ('CONDUCTOR', 'PROPIETARIO', 'SISTEMA');
  END IF;
END
$$;

-- Codigo de acceso de la reserva: va en su QR. El conductor lo muestra al
-- entrar y al salir y el operador lo escanea (o lo tipea). Sin 0 O 1 I L para
-- que no se confundan; el alfabeto tiene que coincidir con src/utils/codigoAcceso.js.
CREATE OR REPLACE FUNCTION generar_codigo_acceso(largo INT) RETURNS TEXT AS $$
DECLARE
  alfabeto CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  codigo TEXT := '';
BEGIN
  FOR i IN 1..largo LOOP
    codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  END LOOP;
  RETURN codigo;
END
$$ LANGUAGE plpgsql VOLATILE;

CREATE TABLE IF NOT EXISTS reserva (
  id_reserva    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conductor  UUID              NOT NULL,
  id_vehiculo   UUID              NOT NULL,
  id_cochera    UUID              NOT NULL,
  -- Si se hizo con un abono (modalidad ABONO, precio 0).
  id_abono      UUID,

  -- Franja reservada.
  inicio        TIMESTAMPTZ       NOT NULL,
  fin           TIMESTAMPTZ       NOT NULL,
  -- El precio se guarda al reservar: cambiar la tarifa despues no lo altera.
  modalidad     modalidad_reserva NOT NULL DEFAULT 'HORA',
  precio_total  DECIMAL(10, 2)    NOT NULL,

  estado        estado_reserva    NOT NULL DEFAULT 'PENDIENTE',
  codigo_acceso VARCHAR(8)        NOT NULL DEFAULT generar_codigo_acceso(8),
  -- Ingreso y egreso reales del vehiculo (los registra el operador con el codigo).
  ingreso_real  TIMESTAMPTZ,
  egreso_real   TIMESTAMPTZ,

  -- Cancelacion: quien (NULL si no esta cancelada) y cuando (lo carga el trigger de abajo).
  cancelada_por origen_cancelacion,
  cancelada_en  TIMESTAMPTZ,
  -- Aviso para el conductor cuando un bloqueo o un auto excedido lo reasigna a
  -- otra cochera o, sin alternativa, cancela su reserva.
  motivo_reasignacion VARCHAR(300),

  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT reserva_conductor_fk
    FOREIGN KEY (id_conductor) REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
  CONSTRAINT reserva_vehiculo_fk
    FOREIGN KEY (id_vehiculo) REFERENCES vehiculo (id_vehiculo) ON DELETE RESTRICT,
  CONSTRAINT reserva_cochera_fk
    FOREIGN KEY (id_cochera) REFERENCES cochera (id_cochera) ON DELETE RESTRICT,
  CONSTRAINT reserva_abono_fk
    FOREIGN KEY (id_abono) REFERENCES abono (id_abono) ON DELETE RESTRICT,
  CONSTRAINT reserva_rango_valido CHECK (fin > inicio),

  -- No se permiten reservas superpuestas: una cochera no puede tener dos
  -- reservas vigentes (PENDIENTE, CONFIRMADA o ACTIVA) que se solapen...
  CONSTRAINT reserva_sin_solapamiento
    EXCLUDE USING gist (id_cochera WITH =, tstzrange(inicio, fin, '[)') WITH &&)
    WHERE (estado IN ('PENDIENTE', 'CONFIRMADA', 'ACTIVA')),
  -- ...ni un vehiculo estar en dos a la vez, aunque sean cocheras distintas.
  -- Son la red de seguridad del chequeo de services/reserva/reserva.service.js.
  CONSTRAINT reserva_vehiculo_sin_solapamiento
    EXCLUDE USING gist (id_vehiculo WITH =, tstzrange(inicio, fin, '[)') WITH &&)
    WHERE (estado IN ('PENDIENTE', 'CONFIRMADA', 'ACTIVA'))
);

CREATE INDEX IF NOT EXISTS idx_reserva_cochera_rango ON reserva (id_cochera, inicio, fin);
CREATE INDEX IF NOT EXISTS idx_reserva_conductor     ON reserva (id_conductor);
CREATE INDEX IF NOT EXISTS idx_reserva_abono         ON reserva (id_abono) WHERE id_abono IS NOT NULL;
-- Los dashboards filtran reservas de toda la plataforma por `inicio`.
CREATE INDEX IF NOT EXISTS idx_reserva_inicio        ON reserva (inicio);
CREATE UNIQUE INDEX IF NOT EXISTS reserva_codigo_acceso_unico ON reserva (codigo_acceso);

-- `cancelada_en` lo carga un trigger y no cada llamador: hay varios caminos
-- que cancelan y asi ninguno se olvida.
CREATE OR REPLACE FUNCTION marcar_cancelada_en() RETURNS trigger AS $$
BEGIN
  IF NEW.estado = 'CANCELADA' AND OLD.estado IS DISTINCT FROM 'CANCELADA' THEN
    NEW.cancelada_en := now();
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER reserva_cancelada_en
  BEFORE UPDATE OF estado ON reserva
  FOR EACH ROW EXECUTE FUNCTION marcar_cancelada_en();
