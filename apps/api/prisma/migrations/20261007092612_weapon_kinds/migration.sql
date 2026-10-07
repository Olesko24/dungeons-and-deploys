-- Weapons are keyed by kind now. Map the old generic keys to the closest kind.
UPDATE "items" SET "key" = 'sword.' || SPLIT_PART("key", '.', 2) WHERE "key" LIKE 'weapon.%';
UPDATE "items" SET "key" = 'greatsword.' || SPLIT_PART("key", '.', 2) WHERE "key" LIKE 'twoHanded.%';
