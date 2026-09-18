-- AlterTable
ALTER TABLE "companies"
ADD COLUMN     "slug" VARCHAR(100),
ADD COLUMN     "catalogo_publico_activo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "descripcion_catalogo" TEXT,
ADD COLUMN     "foto_portada_catalogo" VARCHAR(500),
ADD COLUMN     "whatsapp_ventas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ofrece_domicilio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "valor_domicilio_default" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
