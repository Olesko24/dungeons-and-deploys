-- CreateTable
CREATE TABLE "ideas" (
    "id" SERIAL NOT NULL,
    "author_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_votes" (
    "idea_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,

    CONSTRAINT "idea_votes_pkey" PRIMARY KEY ("idea_id","character_id")
);

-- CreateIndex
CREATE INDEX "ideas_author_id_created_at_idx" ON "ideas"("author_id", "created_at");

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
