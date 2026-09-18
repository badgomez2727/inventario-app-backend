-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "visible_en_catalogo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "public_id" VARCHAR(255) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
