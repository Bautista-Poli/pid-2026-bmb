-- USUARIO: conductores, propietarios y administradores de la plataforma.
-- Todos los archivos de esta carpeta son idempotentes (IF NOT EXISTS): se
-- pueden correr muchas veces. Se aplican en orden por su numero (db/esquema.js).

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
    CREATE TYPE rol_usuario AS ENUM ('CONDUCTOR', 'PROPIETARIO', 'ADMINISTRADOR');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        VARCHAR(80)   NOT NULL,
  apellido      VARCHAR(80)   NOT NULL,
  email         VARCHAR(160)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  telefono      VARCHAR(30),
  -- `rol` es el perfil activo y `roles` los que puede usar.
  rol           rol_usuario   NOT NULL,
  roles         rol_usuario[] NOT NULL DEFAULT '{}',
  activo        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT usuario_email_unico UNIQUE (email)
);
