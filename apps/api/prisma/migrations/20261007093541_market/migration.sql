-- AlterTable
ALTER TABLE "items" ADD COLUMN     "listed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "market_draws" (
    "id" SERIAL NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "rarity" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_draws_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_draws_buyer_id_created_at_idx" ON "market_draws"("buyer_id", "created_at");

-- AddForeignKey
ALTER TABLE "market_draws" ADD CONSTRAINT "market_draws_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
