-- CreateTable
CREATE TABLE "encounters" (
    "id" SERIAL NOT NULL,
    "character_id" INTEGER NOT NULL,
    "monster" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "fought_at" TIMESTAMP(3),
    "won" BOOLEAN,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "loot_item_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encounters_loot_item_id_key" ON "encounters"("loot_item_id");

-- CreateIndex
CREATE INDEX "encounters_character_id_created_at_idx" ON "encounters"("character_id", "created_at");

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_loot_item_id_fkey" FOREIGN KEY ("loot_item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
