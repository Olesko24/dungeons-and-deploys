-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "power" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "characters_power_idx" ON "characters"("power");
