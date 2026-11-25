ALTER TYPE "TipoDescuento" ADD VALUE 'DOS_POR_UNO';

ALTER TABLE "promociones"
ALTER COLUMN "valor_descuento" DROP NOT NULL;

ALTER TABLE "detalles_venta"
ADD COLUMN "descuento_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "unidades_bonificadas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "promocion_titulo" TEXT;
