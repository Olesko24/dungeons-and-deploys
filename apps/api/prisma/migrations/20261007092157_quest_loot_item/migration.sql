-- AlterTable
ALTER TABLE "quests" DROP COLUMN "loot",
ADD COLUMN     "loot_item_id" INTEGER;
-- CreateIndex
CREATE UNIQUE INDEX "quests_loot_item_id_key" ON "quests"("loot_item_id");
-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_loot_item_id_fkey" FOREIGN KEY ("loot_item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
