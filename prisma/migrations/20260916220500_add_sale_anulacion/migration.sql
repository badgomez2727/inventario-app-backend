-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "fecha_anulacion" TIMESTAMP(0),
ADD COLUMN     "anulado_por_user_id" INTEGER,
ADD COLUMN     "motivo_anulacion" TEXT;

-- CreateIndex
CREATE INDEX "sales_anulado_por_user_id_idx" ON "sales"("anulado_por_user_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_anulado_por_user_id_fkey" FOREIGN KEY ("anulado_por_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
