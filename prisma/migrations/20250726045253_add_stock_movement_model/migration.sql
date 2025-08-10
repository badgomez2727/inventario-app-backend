/*
  Warnings:

  - A unique constraint covering the columns `[email,company_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nombreUsuario,company_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE `stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `motivo` VARCHAR(255) NULL,
    `fecha_movimiento` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `stock_movements_product_id_idx`(`product_id`),
    INDEX `stock_movements_company_id_idx`(`company_id`),
    INDEX `stock_movements_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `users_email_company_id_key` ON `users`(`email`, `company_id`);

-- CreateIndex
CREATE UNIQUE INDEX `users_nombreUsuario_company_id_key` ON `users`(`nombreUsuario`, `company_id`);

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
