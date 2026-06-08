-- AlterTable
ALTER TABLE "User" ADD COLUMN "autoExploreDailyWaves" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "autoExploreDayKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "DungeonRun" ADD COLUMN "autoExplore" BOOLEAN NOT NULL DEFAULT false;
