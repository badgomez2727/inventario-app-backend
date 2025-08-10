-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(255) NOT NULL,
    `direccion` VARCHAR(255) NULL,
    `telefono` VARCHAR(50) NULL,
    `emailContacto` VARCHAR(255) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_actualizacion` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `companies_nombre_key`(`nombre`),
    UNIQUE INDEX `companies_emailContacto_key`(`emailContacto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `nombreUsuario` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `rol` VARCHAR(50) NOT NULL DEFAULT 'empleado_inventario',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_actualizacion` TIMESTAMP(0) NOT NULL,

    UNIQUE INDEX `users_nombreUsuario_key`(`nombreUsuario`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_company_id_idx`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `nombre` VARCHAR(255) NOT NULL,
    `descripcion` TEXT NULL,
    `sku` VARCHAR(100) NOT NULL,
    `precio_compra` DECIMAL(10, 2) NOT NULL,
    `precio_venta` DECIMAL(10, 2) NOT NULL,
    `stock_actual` INTEGER NOT NULL DEFAULT 0,
    `unidad_medida` VARCHAR(50) NOT NULL DEFAULT 'unidad',
    `categoria` VARCHAR(100) NULL,
    `imagen_url` VARCHAR(255) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `fecha_creacion` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `fecha_actualizacion` TIMESTAMP(0) NOT NULL,

    INDEX `productos_company_id_idx`(`company_id`),
    UNIQUE INDEX `productos_company_id_sku_key`(`company_id`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
