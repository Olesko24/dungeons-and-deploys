-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "raid_tier" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "raids" ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 0;
