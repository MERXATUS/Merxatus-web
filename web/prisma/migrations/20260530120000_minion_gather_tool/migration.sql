-- 수집 일꾼 전용 도구 슬롯
ALTER TABLE "Minion" ADD COLUMN "equippedToolItemId" TEXT;

CREATE INDEX "Minion_equippedToolItemId_idx" ON "Minion"("equippedToolItemId");

ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedToolItemId_fkey"
  FOREIGN KEY ("equippedToolItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 수집 일꾼은 전투 장비 미사용
UPDATE "Minion"
SET
  "equippedWeaponInstanceId" = NULL,
  "equippedHelmetItemId" = NULL,
  "equippedChestItemId" = NULL,
  "equippedPantsItemId" = NULL,
  "equippedBootsItemId" = NULL
WHERE "pool" = 'GATHER';
