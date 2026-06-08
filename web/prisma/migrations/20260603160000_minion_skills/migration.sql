-- AlterTable
ALTER TABLE "Minion" ADD COLUMN "unspentSkillPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Minion" ADD COLUMN "skillLevelsJson" TEXT NOT NULL DEFAULT '{}';
