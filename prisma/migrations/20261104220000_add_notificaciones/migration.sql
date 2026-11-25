CREATE TABLE "notificaciones" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "venta_id" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_en" TIMESTAMP(3),

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notificaciones_usuario_id_venta_id_key"
ON "notificaciones"("usuario_id", "venta_id");

CREATE INDEX "notificaciones_usuario_id_creada_en_idx"
ON "notificaciones"("usuario_id", "creada_en");

ALTER TABLE "notificaciones"
ADD CONSTRAINT "notificaciones_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notificaciones"
ADD CONSTRAINT "notificaciones_venta_id_fkey"
FOREIGN KEY ("venta_id") REFERENCES "ventas"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
