-- AlterTable
ALTER TABLE "guild_members" ADD COLUMN     "donated" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "gold" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "guild_buffs" (
    "guild_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_buffs_pkey" PRIMARY KEY ("guild_id","key")
);

-- AddForeignKey
ALTER TABLE "guild_buffs" ADD CONSTRAINT "guild_buffs_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
