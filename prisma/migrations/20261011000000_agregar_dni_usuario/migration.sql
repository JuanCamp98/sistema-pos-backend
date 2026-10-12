-- AlterTable
ALTER TABLE "public"."usuarios" ADD COLUMN "dni" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "public"."usuarios"("dni" ASC);
