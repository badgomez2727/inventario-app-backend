-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "plan_expires_at" TIMESTAMP(0);

-- CreateTable
CREATE TABLE "product_change_log" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "campo" VARCHAR(50) NOT NULL,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "fecha" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_change_log_product_id_idx" ON "product_change_log"("product_id");

-- CreateIndex
CREATE INDEX "product_change_log_company_id_idx" ON "product_change_log"("company_id");

-- CreateIndex
CREATE INDEX "product_change_log_user_id_idx" ON "product_change_log"("user_id");

-- AddForeignKey
ALTER TABLE "product_change_log" ADD CONSTRAINT "product_change_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_change_log" ADD CONSTRAINT "product_change_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_change_log" ADD CONSTRAINT "product_change_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
