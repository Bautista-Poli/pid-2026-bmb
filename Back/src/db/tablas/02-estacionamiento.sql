-- ESTACIONAMIENTO, sus horarios de atencion y sus fotos.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_aprobacion') THEN
    CREATE TYPE estado_aprobacion AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS estacionamiento (
  id_estacionamiento UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  id_propietario     UUID           NOT NULL,
  nombre             VARCHAR(120)   NOT NULL,
  descripcion        VARCHAR(500),

  -- Direccion. `direccion` se guarda armada (`calle numero`) para la busqueda.
  direccion          VARCHAR(200)   NOT NULL,
  calle              VARCHAR(120),
  numero             VARCHAR(10),
  barrio_zona        VARCHAR(120),
  ciudad             VARCHAR(80),
  provincia          VARCHAR(80),
  codigo_postal      VARCHAR(10),
  latitud            DECIMAL(9, 6),
  longitud           DECIMAL(9, 6),

  telefono_contacto  VARCHAR(30),
  email_contacto     VARCHAR(160),
  cubierto           BOOLEAN        NOT NULL DEFAULT FALSE,

  -- Tarifas por modalidad: hora, estadia (12 h) y jornada (24 h). Cada una es
  -- opcional (NULL = no la ofrece) pero tiene que haber al menos una.
  tarifa_hora        DECIMAL(10, 2),
  tarifa_estadia     DECIMAL(10, 2),
  tarifa_jornada     DECIMAL(10, 2),

  -- Politica de cancelacion: horas minimas de anticipacion para cancelar una
  -- reserva ya CONFIRMADA. NULL = sin restriccion.
  politica_cancelacion_horas DECIMAL(5, 2),

  -- `publicado` es la intencion del propietario; en la busqueda aparece lo que
  -- esta publicado Y aprobado por un administrador.
  publicado          BOOLEAN        NOT NULL DEFAULT FALSE,
  activo             BOOLEAN        NOT NULL DEFAULT TRUE,

  -- Aprobacion del administrador. `enviado_en`: cuando entro a la cola de
  -- revision por ultima vez (alta, reenvio o cambio de nombre/direccion).
  estado_aprobacion  estado_aprobacion NOT NULL DEFAULT 'PENDIENTE',
  motivo_rechazo     VARCHAR(300),
  revisado_por       UUID,
  revisado_en        TIMESTAMPTZ,
  enviado_en         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT estacionamiento_propietario_fk
    FOREIGN KEY (id_propietario) REFERENCES usuario (id_usuario) ON DELETE RESTRICT,
  CONSTRAINT estacionamiento_revisado_por_fk
    FOREIGN KEY (revisado_por) REFERENCES usuario (id_usuario) ON DELETE SET NULL,
  CONSTRAINT estacionamiento_latitud_valida  CHECK (latitud  IS NULL OR latitud  BETWEEN -90  AND 90),
  CONSTRAINT estacionamiento_longitud_valida CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
  CONSTRAINT estacionamiento_tarifa_no_negativa CHECK (tarifa_hora >= 0),
  CONSTRAINT estacionamiento_tarifa_estadia_no_negativa
    CHECK (tarifa_estadia IS NULL OR tarifa_estadia >= 0),
  CONSTRAINT estacionamiento_tarifa_jornada_no_negativa
    CHECK (tarifa_jornada IS NULL OR tarifa_jornada >= 0),
  CONSTRAINT estacionamiento_alguna_tarifa
    CHECK (tarifa_hora IS NOT NULL OR tarifa_estadia IS NOT NULL OR tarifa_jornada IS NOT NULL),
  CONSTRAINT estacionamiento_politica_cancelacion_no_negativa
    CHECK (politica_cancelacion_horas IS NULL OR politica_cancelacion_horas >= 0),
  CONSTRAINT estacionamiento_rechazo_con_motivo
    CHECK (estado_aprobacion <> 'RECHAZADO' OR motivo_rechazo IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_estacionamiento_propietario ON estacionamiento (id_propietario);
CREATE INDEX IF NOT EXISTS idx_estacionamiento_publicado   ON estacionamiento (publicado, activo);
CREATE INDEX IF NOT EXISTS idx_estacionamiento_aprobacion  ON estacionamiento (estado_aprobacion, enviado_en);

-- HORARIO: una fila por dia de la semana en que abre (0 = domingo ... 6 = sabado).
CREATE TABLE IF NOT EXISTS horario (
  id_horario         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  id_estacionamiento UUID     NOT NULL,
  dia_semana         SMALLINT NOT NULL,
  hora_apertura      TIME     NOT NULL,
  hora_cierre        TIME     NOT NULL,
  CONSTRAINT horario_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE CASCADE,
  CONSTRAINT horario_dia_semana_valido CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT horario_unico_por_dia UNIQUE (id_estacionamiento, dia_semana)
);
