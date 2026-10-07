-- CreateTable
CREATE TABLE "dungeons" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "ended_at" TIMESTAMP(3),
    "success" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dungeons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_members" (
    "dungeon_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "loot_item_id" INTEGER,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dungeon_members_pkey" PRIMARY KEY ("dungeon_id","character_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dungeons_code_key" ON "dungeons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_members_loot_item_id_key" ON "dungeon_members"("loot_item_id");

-- AddForeignKey
ALTER TABLE "dungeon_members" ADD CONSTRAINT "dungeon_members_dungeon_id_fkey" FOREIGN KEY ("dungeon_id") REFERENCES "dungeons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_members" ADD CONSTRAINT "dungeon_members_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_members" ADD CONSTRAINT "dungeon_members_loot_item_id_fkey" FOREIGN KEY ("loot_item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
