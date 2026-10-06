ALTER TABLE "ventas"
ADD COLUMN "mp_order_id" TEXT,
ADD COLUMN "mp_order_status" TEXT,
ADD COLUMN "mp_qr_data" TEXT;

CREATE UNIQUE INDEX "ventas_mp_order_id_key" ON "ventas"("mp_order_id");