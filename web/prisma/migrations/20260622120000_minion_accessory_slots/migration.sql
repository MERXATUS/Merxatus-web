-- AlterTable
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedRing1ItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedRing2ItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedNecklaceItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedNecklace2ItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedRelicItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedRelic2ItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN IF NOT EXISTS "equippedRelic3ItemId" TEXT;

CREATE INDEX IF NOT EXISTS "Minion_equippedRing1ItemId_idx" ON "Minion"("equippedRing1ItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedRing2ItemId_idx" ON "Minion"("equippedRing2ItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedNecklaceItemId_idx" ON "Minion"("equippedNecklaceItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedNecklace2ItemId_idx" ON "Minion"("equippedNecklace2ItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedRelicItemId_idx" ON "Minion"("equippedRelicItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedRelic2ItemId_idx" ON "Minion"("equippedRelic2ItemId");
CREATE INDEX IF NOT EXISTS "Minion_equippedRelic3ItemId_idx" ON "Minion"("equippedRelic3ItemId");

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedRing1ItemId_fkey" FOREIGN KEY ("equippedRing1ItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedRing2ItemId_fkey" FOREIGN KEY ("equippedRing2ItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedNecklaceItemId_fkey" FOREIGN KEY ("equippedNecklaceItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedNecklace2ItemId_fkey" FOREIGN KEY ("equippedNecklace2ItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedRelicItemId_fkey" FOREIGN KEY ("equippedRelicItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedRelic2ItemId_fkey" FOREIGN KEY ("equippedRelic2ItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedRelic3ItemId_fkey" FOREIGN KEY ("equippedRelic3ItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
