-- CALIFICACION. Una por lado de cada reserva (`autor`): el CONDUCTOR califica
-- al estacionamiento y el PROPIETARIO al conductor, con un `puntaje` de 1 a 5.
-- Incluye la denuncia de la reseña y su moderacion por el administrador.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'autor_calificacion') THEN
    CREATE TYPE autor_calificacion AS ENUM ('CONDUCTOR', 'PROPIETARIO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_denuncia_resena') THEN
    CREATE TYPE estado_denuncia_resena AS ENUM ('PENDIENTE', 'DESESTIMADA', 'OCULTA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'motivo_denuncia_resena') THEN
    CREATE TYPE motivo_denuncia_resena AS ENUM ('OFENSIVA', 'FALSA', 'DATOS_PERSONALES', 'OTRO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS calificacion (
  id_calificacion    UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  id_reserva         UUID               NOT NULL,
  autor              autor_calificacion NOT NULL,
  id_estacionamiento UUID               NOT NULL,
  id_conductor       UUID               NOT NULL,
  puntaje            SMALLINT           NOT NULL,
  comentario         VARCHAR(500),

  -- Gamificacion "Anfitrion destacado": las cinco categorias (1 a 5) y
  -- etiquetas, solo en las del CONDUCTOR. Son opcionales; cuando vienen,
  -- `puntaje` es su promedio redondeado (ver services/reputacion).
  limpieza           SMALLINT,
  infraestructura    SMALLINT,
  atencion           SMALLINT,
  seguridad          SMALLINT,
  acceso             SMALLINT,
  etiquetas          TEXT[]             NOT NULL DEFAULT '{}',

  -- Denuncia de la reseña: la parte calificada la denuncia (una vez) y el
  -- administrador la desestima o la oculta. Una `oculta` deja de contar en la
  -- reputacion y de mostrarse. `denuncia_estado` NULL = nadie la denuncio.
  oculta             BOOLEAN            NOT NULL DEFAULT FALSE,
  denuncia_estado    estado_denuncia_resena,
  denuncia_motivo    motivo_denuncia_resena,
  denuncia_detalle   VARCHAR(500),
  denunciada_at      TIMESTAMPTZ,
  moderada_por       UUID,
  moderada_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ        NOT NULL DEFAULT now(),

  CONSTRAINT calificacion_reserva_fk
    FOREIGN KEY (id_reserva) REFERENCES reserva (id_reserva) ON DELETE CASCADE,
  CONSTRAINT calificacion_estacionamiento_fk
    FOREIGN KEY (id_estacionamiento) REFERENCES estacionamiento (id_estacionamiento) ON DELETE CASCADE,
  CONSTRAINT calificacion_conductor_fk
    FOREIGN KEY (id_conductor) REFERENCES usuario (id_usuario) ON DELETE CASCADE,
  CONSTRAINT calificacion_moderada_por_fk
    FOREIGN KEY (moderada_por) REFERENCES usuario (id_usuario) ON DELETE SET NULL,
  CONSTRAINT calificacion_una_por_lado UNIQUE (id_reserva, autor),
  CONSTRAINT calificacion_puntaje_valido CHECK (puntaje BETWEEN 1 AND 5),
  -- Las cinco categorias juntas o ninguna, y de 1 a 5.
  CONSTRAINT calificacion_categorias_validas CHECK (
    (limpieza IS NULL AND infraestructura IS NULL AND atencion IS NULL AND seguridad IS NULL AND acceso IS NULL)
    OR (limpieza BETWEEN 1 AND 5 AND infraestructura BETWEEN 1 AND 5 AND atencion BETWEEN 1 AND 5
        AND seguridad BETWEEN 1 AND 5 AND acceso BETWEEN 1 AND 5)
  )
);

CREATE INDEX IF NOT EXISTS idx_calificacion_estacionamiento ON calificacion (id_estacionamiento, autor);
CREATE INDEX IF NOT EXISTS idx_calificacion_conductor       ON calificacion (id_conductor, autor);
CREATE INDEX IF NOT EXISTS idx_calificacion_denuncia
  ON calificacion (denunciada_at) WHERE denuncia_estado = 'PENDIENTE';
