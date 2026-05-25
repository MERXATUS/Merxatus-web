-- Persist party HP between PUSH_LUCK floors
ALTER TABLE "DungeonRun" ADD COLUMN IF NOT EXISTS "partyHpJson" TEXT NOT NULL DEFAULT '[]';
