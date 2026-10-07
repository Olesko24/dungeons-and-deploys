-- CreateTable
CREATE TABLE "achievements" (
    "character_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("character_id","key")
);

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
