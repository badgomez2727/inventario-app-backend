-- CreateTable
CREATE TABLE "pedidos" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "tipo_entrega" VARCHAR(20) NOT NULL,
    "direccion_entrega" TEXT,
    "valor_domicilio" DECIMAL(10,2),
    "total" DECIMAL(10,2) NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "motivo_rechazo" TEXT,
    "sale_id" INTEGER,
    "fecha_pedido" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_revision" TIMESTAMP(0),
    "revisado_por_user_id" INTEGER,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_items" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_sale_id_key" ON "pedidos"("sale_id");

-- CreateIndex
CREATE INDEX "pedidos_company_id_idx" ON "pedidos"("company_id");

-- CreateIndex
CREATE INDEX "pedidos_client_id_idx" ON "pedidos"("client_id");

-- CreateIndex
CREATE INDEX "pedidos_revisado_por_user_id_idx" ON "pedidos"("revisado_por_user_id");

-- CreateIndex
CREATE INDEX "pedido_items_pedido_id_idx" ON "pedido_items"("pedido_id");

-- CreateIndex
CREATE INDEX "pedido_items_product_id_idx" ON "pedido_items"("product_id");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_revisado_por_user_id_fkey" FOREIGN KEY ("revisado_por_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
