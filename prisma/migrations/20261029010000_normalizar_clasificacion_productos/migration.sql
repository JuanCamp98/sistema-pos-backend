-- Normaliza la clasificación conservando los valores de productos existentes.
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tipos_producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tipos_producto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");
CREATE UNIQUE INDEX "tipos_producto_nombre_key" ON "tipos_producto"("nombre");

INSERT INTO "categorias" ("id", "nombre", "actualizado_en")
SELECT md5("categoria"), "categoria", CURRENT_TIMESTAMP
FROM "productos"
WHERE NULLIF(BTRIM("categoria"), '') IS NOT NULL
GROUP BY "categoria";

INSERT INTO "categorias" ("id", "nombre", "actualizado_en")
VALUES (md5('categoria-sin-categoria'), 'Sin categoría', CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

INSERT INTO "tipos_producto" ("id", "nombre", "actualizado_en")
VALUES (md5('tipo-producto-general'), 'General', CURRENT_TIMESTAMP);

ALTER TABLE "productos" ADD COLUMN "categoria_id" TEXT;
ALTER TABLE "productos" ADD COLUMN "tipo_producto_id" TEXT;

UPDATE "productos" p
SET "categoria_id" = c."id"
FROM "categorias" c
WHERE c."nombre" = p."categoria";

UPDATE "productos"
SET "categoria_id" = md5('categoria-sin-categoria')
WHERE "categoria_id" IS NULL;

UPDATE "productos"
SET "tipo_producto_id" = md5('tipo-producto-general')
WHERE "tipo_producto_id" IS NULL;

ALTER TABLE "productos" ALTER COLUMN "categoria_id" SET NOT NULL;
ALTER TABLE "productos" ALTER COLUMN "tipo_producto_id" SET NOT NULL;
ALTER TABLE "productos" DROP COLUMN "categoria";

ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "productos" ADD CONSTRAINT "productos_tipo_producto_id_fkey" FOREIGN KEY ("tipo_producto_id") REFERENCES "tipos_producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
