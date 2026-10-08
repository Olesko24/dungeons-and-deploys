-- AlterTable
ALTER TABLE "items" ADD COLUMN     "scrapped_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "characters_xp_idx" ON "characters"("xp");

-- CreateIndex
CREATE INDEX "dungeon_members_character_id_idx" ON "dungeon_members"("character_id");

-- CreateIndex
CREATE INDEX "items_character_id_scrapped_at_idx" ON "items"("character_id", "scrapped_at");

-- CreateIndex
CREATE INDEX "market_draws_seller_id_idx" ON "market_draws"("seller_id");

-- CreateIndex
CREATE INDEX "raid_members_character_id_idx" ON "raid_members"("character_id");
