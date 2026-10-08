-- CreateTable
CREATE TABLE "shards" (
    "character_id" INTEGER NOT NULL,
    "rarity" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shards_pkey" PRIMARY KEY ("character_id","rarity")
);

-- AddForeignKey
ALTER TABLE "shards" ADD CONSTRAINT "shards_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
