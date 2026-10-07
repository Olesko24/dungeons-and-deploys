-- DropIndex
DROP INDEX "users_email_key";
-- AlterTable
ALTER TABLE "users" DROP COLUMN "email";
-- DropTable
DROP TABLE "logins";
-- CreateTable
CREATE TABLE "pair_codes" (
    "code_hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pair_codes_pkey" PRIMARY KEY ("code_hash")
);
-- CreateIndex
CREATE UNIQUE INDEX "characters_name_key" ON "characters"("name");
-- AddForeignKey
ALTER TABLE "pair_codes" ADD CONSTRAINT "pair_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
