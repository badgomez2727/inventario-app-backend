-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "clients_companyId_telefono_idx" ON "clients"("companyId", "telefono");
