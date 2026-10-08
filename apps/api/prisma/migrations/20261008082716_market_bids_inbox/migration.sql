-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "inbox_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "price" INTEGER;

-- CreateTable
CREATE TABLE "market_bids" (
    "item_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_bids_pkey" PRIMARY KEY ("item_id","character_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "character_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_bids_character_id_idx" ON "market_bids"("character_id");

-- CreateIndex
CREATE INDEX "notifications_character_id_created_at_idx" ON "notifications"("character_id", "created_at");

-- CreateIndex
CREATE INDEX "items_listed_at_idx" ON "items"("listed_at");

-- AddForeignKey
ALTER TABLE "market_bids" ADD CONSTRAINT "market_bids_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_bids" ADD CONSTRAINT "market_bids_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Listings from the old market get the base price of their rarity and can be bought at once.
UPDATE "items" SET "price" = CASE split_part("key", '.', 2)
  WHEN 'common' THEN 20 WHEN 'uncommon' THEN 35 WHEN 'rare' THEN 60 WHEN 'epic' THEN 120 WHEN 'legendary' THEN 250
  WHEN 'mythic' THEN 500 WHEN 'ancient' THEN 900 WHEN 'divine' THEN 1600 WHEN 'celestial' THEN 2800 ELSE 5000 END
WHERE "listed_at" IS NOT NULL;
