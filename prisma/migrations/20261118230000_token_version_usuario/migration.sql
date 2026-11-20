-- Version de token JWT por usuario para poder revocar sesiones abiertas.
-- La columna es no destructiva: los usuarios existentes quedan en la version 0.
ALTER TABLE "usuarios" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
