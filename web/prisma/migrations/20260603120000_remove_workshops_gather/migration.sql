-- Remove deprecated gather/workshop/specialist/tool/minion-market data

DELETE FROM "TradeOfferItem" WHERE kind = 'TOOL_INSTANCE';
DELETE FROM "ToolInstance";

DELETE FROM "WorkshopAssignment";
DELETE FROM "WorkshopInstance";
DELETE FROM "RecipeOutput";
DELETE FROM "RecipeInput";
DELETE FROM "Recipe";
DELETE FROM "DropTableEntry";
DELETE FROM "WorkshopType";

DELETE FROM "MinionContract";
DELETE FROM "MinionMarketListing";

UPDATE "Minion" SET pool = 'DUNGEON' WHERE pool = 'GATHER';
UPDATE "Minion" SET "equippedToolItemId" = NULL WHERE "equippedToolItemId" IS NOT NULL;

UPDATE "MinionInventory" mi SET
  "owned" = sub.cnt,
  "dungeonOwned" = sub.cnt,
  "gatherOwned" = 0
FROM (
  SELECT "userId", LEAST(COUNT(*)::int, 10) AS cnt
  FROM "Minion"
  GROUP BY "userId"
) sub
WHERE mi."userId" = sub."userId";

ALTER TABLE "MinionInventory" DROP COLUMN IF EXISTS "gatherOwned";

ALTER TABLE "User" DROP COLUMN IF EXISTS "plotSlotsUnlocked";
ALTER TABLE "User" DROP COLUMN IF EXISTS "specialistUnlocked";
ALTER TABLE "User" DROP COLUMN IF EXISTS "specialistProfession";

ALTER TABLE "Minion" DROP COLUMN IF EXISTS "pool";
ALTER TABLE "Minion" DROP COLUMN IF EXISTS "equippedToolItemId";

ALTER TABLE "TradeOfferItem" DROP COLUMN IF EXISTS "toolInstanceId";

DROP TABLE IF EXISTS "WorkshopAssignment";
DROP TABLE IF EXISTS "WorkshopInstance";
DROP TABLE IF EXISTS "RecipeOutput";
DROP TABLE IF EXISTS "RecipeInput";
DROP TABLE IF EXISTS "Recipe";
DROP TABLE IF EXISTS "DropTableEntry";
DROP TABLE IF EXISTS "WorkshopType";
DROP TABLE IF EXISTS "ToolInstance";
DROP TABLE IF EXISTS "MinionContract";
DROP TABLE IF EXISTS "MinionMarketListing";

DROP TYPE IF EXISTS "WorkshopKind";
DROP TYPE IF EXISTS "SpecialistProfession";
DROP TYPE IF EXISTS "MinionPool";
DROP TYPE IF EXISTS "ToolInstanceStatus";
DROP TYPE IF EXISTS "MinionMarketListingStatus";
DROP TYPE IF EXISTS "MinionContractStatus";
DROP TYPE IF EXISTS "MinionContractScope";

CREATE TYPE "TradeOfferItemKind_new" AS ENUM ('STACK', 'WEAPON_INSTANCE', 'ARMOR_INSTANCE');
ALTER TABLE "TradeOfferItem"
  ALTER COLUMN "kind" TYPE "TradeOfferItemKind_new"
  USING ("kind"::text::"TradeOfferItemKind_new");
DROP TYPE "TradeOfferItemKind";
ALTER TYPE "TradeOfferItemKind_new" RENAME TO "TradeOfferItemKind";
