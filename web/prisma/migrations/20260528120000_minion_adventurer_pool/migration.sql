-- 수집/던전 풀
CREATE TYPE "MinionPool" AS ENUM ('GATHER', 'DUNGEON');

ALTER TABLE "Minion" ADD COLUMN "pool" "MinionPool" NOT NULL DEFAULT 'GATHER';

UPDATE "Minion" SET "pool" = 'DUNGEON'
WHERE "jobType" IN ('WARRIOR', 'ARCHER', 'MAGE');

UPDATE "Minion" SET "jobType" = 'ADVENTURER';

UPDATE "WorkshopAssignment" SET "jobType" = 'ADVENTURER'
WHERE "jobType" NOT IN ('ADVENTURER');
