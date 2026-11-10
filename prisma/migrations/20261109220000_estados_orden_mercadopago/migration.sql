ALTER TYPE "EstadoVenta" ADD VALUE 'REEMBOLSADA';

ALTER TABLE "ventas"
ADD COLUMN "mp_order_status_detail" TEXT;
