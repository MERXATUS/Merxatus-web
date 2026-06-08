-- CreateTable
CREATE TABLE "DungeonGoldEarn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dungeonId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DungeonGoldEarn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DungeonGoldEarn_userId_createdAt_idx" ON "DungeonGoldEarn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DungeonGoldEarn_dungeonId_createdAt_idx" ON "DungeonGoldEarn"("dungeonId", "createdAt");

-- AddForeignKey
ALTER TABLE "DungeonGoldEarn" ADD CONSTRAINT "DungeonGoldEarn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
