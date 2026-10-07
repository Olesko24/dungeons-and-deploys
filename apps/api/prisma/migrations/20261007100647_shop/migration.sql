-- CreateTable
CREATE TABLE "shop_purchases" (
    "character_id" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "offer" INTEGER NOT NULL,
    "item_key" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_purchases_pkey" PRIMARY KEY ("character_id","day","offer")
);

-- AddForeignKey
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
