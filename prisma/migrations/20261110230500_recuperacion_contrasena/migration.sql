CREATE TABLE "recuperaciones_contrasena" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperaciones_contrasena_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recuperaciones_contrasena_token_hash_key"
ON "recuperaciones_contrasena"("token_hash");

CREATE INDEX "recuperaciones_contrasena_usuario_id_idx"
ON "recuperaciones_contrasena"("usuario_id");

CREATE INDEX "recuperaciones_contrasena_vence_en_idx"
ON "recuperaciones_contrasena"("vence_en");

ALTER TABLE "recuperaciones_contrasena"
ADD CONSTRAINT "recuperaciones_contrasena_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
