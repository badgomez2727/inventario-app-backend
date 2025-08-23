/*
  Warnings:

  - You are about to drop the column `supplier_id` on the `productos` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[reset_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "productos" DROP CONSTRAINT "productos_supplier_id_fkey";

-- DropIndex
DROP INDEX "productos_supplier_id_idx";

-- AlterTable
ALTER TABLE "productos" DROP COLUMN "supplier_id";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reset_token" VARCHAR(255),
ADD COLUMN     "reset_token_expires" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "product_suppliers" (
    "product_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "supplier_sku" VARCHAR(100),

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("product_id","supplier_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
