-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "auto_scrap" TEXT;

-- CreateIndex
CREATE INDEX "market_draws_created_at_idx" ON "market_draws"("created_at");
