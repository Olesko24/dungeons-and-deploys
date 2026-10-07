-- At most one running quest per character. Prisma cannot express partial indexes, so it lives here only.
CREATE UNIQUE INDEX "quests_one_active_per_character" ON "quests"("character_id") WHERE "resolved_at" IS NULL;
