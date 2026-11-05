CREATE TYPE "TipoDescuento" AS ENUM ('PORCENTAJE', 'IMPORTE');

CREATE TABLE "promociones" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo_descuento" "TipoDescuento" NOT NULL,
    "valor_descuento" DECIMAL(10,2) NOT NULL,
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promociones_productos" (
    "promocion_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    CONSTRAINT "promociones_productos_pkey" PRIMARY KEY ("promocion_id", "producto_id")
);

CREATE TABLE "promociones_categorias" (
    "promocion_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    CONSTRAINT "promociones_categorias_pkey" PRIMARY KEY ("promocion_id", "categoria")
);

ALTER TABLE "promociones_productos" ADD CONSTRAINT "promociones_productos_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promociones_productos" ADD CONSTRAINT "promociones_productos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promociones_categorias" ADD CONSTRAINT "promociones_categorias_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
