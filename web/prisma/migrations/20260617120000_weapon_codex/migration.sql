-- CreateTable
CREATE TABLE IF NOT EXISTS "WeaponCodexEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseItemId" TEXT NOT NULL,
    "bonusPower" INTEGER NOT NULL DEFAULT 0,
    "bonusAtkMilli" INTEGER NOT NULL DEFAULT 0,
    "bonusMagicMilli" INTEGER NOT NULL DEFAULT 0,
    "registeredEnhanceLevel" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeaponCodexEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeaponCodexEntry_userId_baseItemId_key" ON "WeaponCodexEntry"("userId", "baseItemId");
CREATE INDEX IF NOT EXISTS "WeaponCodexEntry_userId_idx" ON "WeaponCodexEntry"("userId");

DO $$ BEGIN
  ALTER TABLE "WeaponCodexEntry" ADD CONSTRAINT "WeaponCodexEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
