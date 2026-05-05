UPDATE "Recipe" SET "minTier" = 1 WHERE "name" NOT LIKE '%(T%' AND "name" NOT LIKE '%(t%';
UPDATE "Recipe" SET "minTier" = 1 WHERE "name" LIKE '%(T1)%' OR "name" LIKE '%(t1)%';
UPDATE "Recipe" SET "minTier" = 2 WHERE "name" LIKE '%(T2)%' OR "name" LIKE '%(t2)%';
UPDATE "Recipe" SET "minTier" = 3 WHERE "name" LIKE '%(T3)%' OR "name" LIKE '%(t3)%';
UPDATE "Recipe" SET "minTier" = 4 WHERE "name" LIKE '%(T4)%' OR "name" LIKE '%(t4)%';
UPDATE "Recipe" SET "minTier" = 5 WHERE "name" LIKE '%(T5)%' OR "name" LIKE '%(t5)%';
