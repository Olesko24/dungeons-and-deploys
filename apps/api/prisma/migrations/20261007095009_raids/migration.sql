-- CreateTable
CREATE TABLE "raids" (
    "id" SERIAL NOT NULL,
    "guild_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'scheduled',
    "boss_hp" INTEGER NOT NULL DEFAULT 0,
    "boss_max_hp" INTEGER NOT NULL DEFAULT 0,
    "tick" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raid_members" (
    "raid_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 0,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "loot_item_id" INTEGER,

    CONSTRAINT "raid_members_pkey" PRIMARY KEY ("raid_id","character_id")
);

-- CreateIndex
CREATE INDEX "raids_guild_id_starts_at_idx" ON "raids"("guild_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "raid_members_loot_item_id_key" ON "raid_members"("loot_item_id");

-- AddForeignKey
ALTER TABLE "raids" ADD CONSTRAINT "raids_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_members" ADD CONSTRAINT "raid_members_raid_id_fkey" FOREIGN KEY ("raid_id") REFERENCES "raids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_members" ADD CONSTRAINT "raid_members_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raid_members" ADD CONSTRAINT "raid_members_loot_item_id_fkey" FOREIGN KEY ("loot_item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
