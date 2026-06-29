-- Persist party combat build for the duration of a dungeon run (avoid re-loading gear/codex every floor).
ALTER TABLE "DungeonRun" ADD COLUMN IF NOT EXISTS "partyBuildJson" TEXT NOT NULL DEFAULT '';
