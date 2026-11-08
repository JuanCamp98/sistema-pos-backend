ALTER TABLE "ventas"
ADD COLUMN "fecha_retiro" DATE,
ADD COLUMN "horario_retiro_inicio" VARCHAR(5),
ADD COLUMN "horario_retiro_fin" VARCHAR(5);

CREATE TABLE "configuracion_retiro" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "configuracion" JSONB NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_retiro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuracion_retiro_id_check" CHECK ("id" = 1)
);
