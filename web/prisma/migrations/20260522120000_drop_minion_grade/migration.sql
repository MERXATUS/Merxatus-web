-- DropMinionLetterGrade
ALTER TABLE "Minion" DROP COLUMN IF EXISTS "grade";
DROP TYPE IF EXISTS "MinionGrade";
