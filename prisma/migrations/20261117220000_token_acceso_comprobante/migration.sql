-- Token de acceso aleatorio para consultar el comprobante sin sesion.
-- La columna es opcional para conservar las ventas existentes.
ALTER TABLE "ventas" ADD COLUMN     "token_acceso" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ventas_token_acceso_key" ON "ventas"("token_acceso");
