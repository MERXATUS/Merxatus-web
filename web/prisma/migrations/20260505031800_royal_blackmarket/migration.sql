-- Honor/Infamy on User
ALTER TABLE "User" ADD COLUMN "honorPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "infamyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "honorTitle" TEXT;

-- Royal fixed prices
CREATE TABLE "RoyalPrice" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "buyPricePerUnit" INTEGER NOT NULL,
  "sellPricePerUnit" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoyalPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- BlackMarket event kind (stored as TEXT)
-- (SQLite: Prisma enums are TEXT columns)

CREATE TABLE "BlackMarketPrice" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "multiplier" REAL NOT NULL DEFAULT 1,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlackMarketPrice_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BlackMarketEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "category" TEXT,
  "itemId" TEXT,
  "multiplier" REAL NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlackMarketEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BlackMarketEvent_startsAt_idx" ON "BlackMarketEvent"("startsAt");
CREATE INDEX "BlackMarketEvent_endsAt_idx" ON "BlackMarketEvent"("endsAt");
CREATE INDEX "BlackMarketEvent_category_startsAt_idx" ON "BlackMarketEvent"("category", "startsAt");
CREATE INDEX "BlackMarketEvent_itemId_startsAt_idx" ON "BlackMarketEvent"("itemId", "startsAt");

CREATE TABLE "RoyalTradeLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "goldDelta" INTEGER NOT NULL,
  "honorDelta" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoyalTradeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoyalTradeLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RoyalTradeLog_userId_createdAt_idx" ON "RoyalTradeLog"("userId", "createdAt");
CREATE INDEX "RoyalTradeLog_itemId_createdAt_idx" ON "RoyalTradeLog"("itemId", "createdAt");

CREATE TABLE "BlackMarketTradeLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "goldDelta" INTEGER NOT NULL,
  "infamyDelta" INTEGER NOT NULL,
  "eventId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlackMarketTradeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlackMarketTradeLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BlackMarketTradeLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BlackMarketEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BlackMarketTradeLog_userId_createdAt_idx" ON "BlackMarketTradeLog"("userId", "createdAt");
CREATE INDEX "BlackMarketTradeLog_itemId_createdAt_idx" ON "BlackMarketTradeLog"("itemId", "createdAt");
CREATE INDEX "BlackMarketTradeLog_eventId_createdAt_idx" ON "BlackMarketTradeLog"("eventId", "createdAt");

