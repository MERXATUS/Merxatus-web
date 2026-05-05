-- Add push-your-luck run state to DungeonRun
ALTER TABLE "DungeonRun" ADD COLUMN "floor" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DungeonRun" ADD COLUMN "pendingLootJson" TEXT NOT NULL DEFAULT '[]';

