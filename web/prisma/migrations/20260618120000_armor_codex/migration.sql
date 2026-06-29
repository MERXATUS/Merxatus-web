-- CreateTable
CREATE TABLE IF NOT EXISTS "ArmorCodexEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseItemId" TEXT NOT NULL,
    "bonusPower" INTEGER NOT NULL DEFAULT 0,
    "bonusHpMilli" INTEGER NOT NULL DEFAULT 0,
    "bonusDefMilli" INTEGER NOT NULL DEFAULT 0,
    "registeredEnhanceLevel" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArmorCodexEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArmorCodexEntry_userId_baseItemId_key" ON "ArmorCodexEntry"("userId", "baseItemId");
CREATE INDEX IF NOT EXISTS "ArmorCodexEntry_userId_idx" ON "ArmorCodexEntry"("userId");

DO $$ BEGIN
  ALTER TABLE "ArmorCodexEntry" ADD CONSTRAINT "ArmorCodexEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
