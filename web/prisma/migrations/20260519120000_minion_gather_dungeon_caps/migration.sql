-- AlterTable
ALTER TABLE "MinionInventory" ADD COLUMN "gatherOwned" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MinionInventory" ADD COLUMN "dungeonOwned" INTEGER NOT NULL DEFAULT 0;

UPDATE "MinionInventory" mi SET
  "gatherOwned" = LEAST(10, (
    SELECT COUNT(*)::int FROM "Minion" m
    WHERE m."userId" = mi."userId"
      AND m."jobType" IN ('MINER', 'FISHER', 'ARCHAEOLOGIST', 'EXPLORER', 'UNASSIGNED')
  )),
  "dungeonOwned" = LEAST(10, (
    SELECT COUNT(*)::int FROM "Minion" m
    WHERE m."userId" = mi."userId"
      AND m."jobType" IN ('WARRIOR', 'ARCHER', 'MAGE')
  ));

UPDATE "MinionInventory" SET "owned" = "gatherOwned" + "dungeonOwned";
