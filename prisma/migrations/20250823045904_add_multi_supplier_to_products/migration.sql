/*
  Warnings:

  - You are about to drop the column `reset_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `reset_token_expires` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `product_suppliers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "product_suppliers" DROP CONSTRAINT "product_suppliers_product_id_fkey";

-- DropForeignKey
ALTER TABLE "product_suppliers" DROP CONSTRAINT "product_suppliers_supplier_id_fkey";

-- DropIndex
DROP INDEX "users_reset_token_key";

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "supplier_id" INTEGER;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "reset_token",
DROP COLUMN "reset_token_expires";

-- DropTable
DROP TABLE "product_suppliers";

-- CreateIndex
CREATE INDEX "productos_supplier_id_idx" ON "productos"("supplier_id");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
