ALTER TYPE "TipoDescuento" ADD VALUE 'COMBO';

ALTER TABLE "promociones"
ADD COLUMN "precio_combo" DECIMAL(10,2);

ALTER TABLE "detalles_venta"
ADD COLUMN "combos_aplicados" INTEGER NOT NULL DEFAULT 0;
