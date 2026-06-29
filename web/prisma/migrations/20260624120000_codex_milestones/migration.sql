-- 도감 마일스톤: 종류당 다단계 등록
ALTER TABLE "WeaponCodexEntry" ADD COLUMN IF NOT EXISTS "milestoneId" TEXT NOT NULL DEFAULT 'base';
ALTER TABLE "WeaponCodexEntry" ADD COLUMN IF NOT EXISTS "registeredQuality" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WeaponCodexEntry" ADD COLUMN IF NOT EXISTS "registeredItemLevel" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "ArmorCodexEntry" ADD COLUMN IF NOT EXISTS "milestoneId" TEXT NOT NULL DEFAULT 'base';
ALTER TABLE "ArmorCodexEntry" ADD COLUMN IF NOT EXISTS "registeredQuality" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ArmorCodexEntry" ADD COLUMN IF NOT EXISTS "registeredItemLevel" INTEGER NOT NULL DEFAULT 10;

DROP INDEX IF EXISTS "WeaponCodexEntry_userId_baseItemId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "WeaponCodexEntry_userId_baseItemId_milestoneId_key"
  ON "WeaponCodexEntry"("userId", "baseItemId", "milestoneId");

DROP INDEX IF EXISTS "ArmorCodexEntry_userId_baseItemId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ArmorCodexEntry_userId_baseItemId_milestoneId_key"
  ON "ArmorCodexEntry"("userId", "baseItemId", "milestoneId");
