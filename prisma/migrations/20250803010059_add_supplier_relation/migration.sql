-- AlterTable
ALTER TABLE `productos` ADD COLUMN `supplier_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `productos_supplier_id_idx` ON `productos`(`supplier_id`);

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
