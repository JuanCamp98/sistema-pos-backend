-- CreateTable
CREATE TABLE "configuracion_stock" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "umbral_stock_bajo" INTEGER NOT NULL DEFAULT 5,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_stock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuracion_stock_id_check" CHECK ("id" = 1),
    CONSTRAINT "configuracion_stock_umbral_check" CHECK ("umbral_stock_bajo" >= 0)
);

-- Valor inicial: el comportamiento existente usaba 5 unidades.
-- Si la fila ya existiera (por ejemplo, por una carga previa), no se pisa.
INSERT INTO "configuracion_stock" ("id", "umbral_stock_bajo", "actualizado_en")
VALUES (1, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
