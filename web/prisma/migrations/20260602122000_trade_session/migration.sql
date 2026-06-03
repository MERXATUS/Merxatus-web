-- Trade system (direct trade with escrow)
DO $$ BEGIN
  CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'LOCKED', 'COMPLETED', 'CANCELLED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TradeOfferItemKind" AS ENUM ('STACK', 'WEAPON_INSTANCE', 'ARMOR_INSTANCE', 'TOOL_INSTANCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TradeSession" (
  "id" TEXT NOT NULL,
  "userAId" TEXT NOT NULL,
  "userBId" TEXT NOT NULL,
  "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
  "offeredGoldA" INTEGER NOT NULL DEFAULT 0,
  "offeredGoldB" INTEGER NOT NULL DEFAULT 0,
  "lockedGoldA" INTEGER NOT NULL DEFAULT 0,
  "lockedGoldB" INTEGER NOT NULL DEFAULT 0,
  "lockedA" BOOLEAN NOT NULL DEFAULT false,
  "lockedB" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAAt" TIMESTAMP(3),
  "confirmedBAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TradeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TradeOfferItem" (
  "id" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "kind" "TradeOfferItemKind" NOT NULL,
  "itemId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "weaponInstanceId" TEXT,
  "armorInstanceId" TEXT,
  "toolInstanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeOfferItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TradeEscrowStack" (
  "id" TEXT NOT NULL,
  "tradeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeEscrowStack_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TradeSession_userAId_status_createdAt_idx" ON "TradeSession" ("userAId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TradeSession_userBId_status_createdAt_idx" ON "TradeSession" ("userBId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TradeSession_status_expiresAt_idx" ON "TradeSession" ("status", "expiresAt");

CREATE INDEX IF NOT EXISTS "TradeOfferItem_tradeId_side_idx" ON "TradeOfferItem" ("tradeId", "side");
CREATE INDEX IF NOT EXISTS "TradeOfferItem_tradeId_kind_idx" ON "TradeOfferItem" ("tradeId", "kind");

CREATE INDEX IF NOT EXISTS "TradeEscrowStack_tradeId_idx" ON "TradeEscrowStack" ("tradeId");
CREATE INDEX IF NOT EXISTS "TradeEscrowStack_userId_createdAt_idx" ON "TradeEscrowStack" ("userId", "createdAt");

-- Uniques
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_weaponInstanceId_key" UNIQUE ("weaponInstanceId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_armorInstanceId_key" UNIQUE ("armorInstanceId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_toolInstanceId_key" UNIQUE ("toolInstanceId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TradeEscrowStack" ADD CONSTRAINT "TradeEscrowStack_tradeId_userId_itemId_key" UNIQUE ("tradeId", "userId", "itemId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "TradeSession" ADD CONSTRAINT "TradeSession_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeSession" ADD CONSTRAINT "TradeSession_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "TradeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_weaponInstanceId_fkey" FOREIGN KEY ("weaponInstanceId") REFERENCES "WeaponInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_armorInstanceId_fkey" FOREIGN KEY ("armorInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeOfferItem" ADD CONSTRAINT "TradeOfferItem_toolInstanceId_fkey" FOREIGN KEY ("toolInstanceId") REFERENCES "ToolInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TradeEscrowStack" ADD CONSTRAINT "TradeEscrowStack_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "TradeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeEscrowStack" ADD CONSTRAINT "TradeEscrowStack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TradeEscrowStack" ADD CONSTRAINT "TradeEscrowStack_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

