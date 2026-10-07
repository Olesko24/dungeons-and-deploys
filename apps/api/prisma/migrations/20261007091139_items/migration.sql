-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "loot" TEXT;

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "character_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "equipped_slot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_character_id_equipped_slot_key" ON "items"("character_id", "equipped_slot");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
