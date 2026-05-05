-- 레시피별 필요 최소 시설 티어 (가공 등)
ALTER TABLE "Recipe" ADD COLUMN "minTier" INTEGER NOT NULL DEFAULT 1;
