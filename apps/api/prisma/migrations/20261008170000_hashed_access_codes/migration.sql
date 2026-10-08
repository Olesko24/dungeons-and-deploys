-- Access codes are stored as SHA-256 hex hashes, like pair codes.
ALTER TABLE "access_codes" RENAME COLUMN "code" TO "code_hash";
UPDATE "access_codes" SET "code_hash" = encode(sha256(convert_to("code_hash", 'UTF8')), 'hex');
