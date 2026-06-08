-- CreateTable
CREATE TABLE "PvpMatch" (
    "id" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "attackerMinionId" TEXT NOT NULL,
    "defenderMinionId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "combatLogJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvpMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PvpMatch_attackerId_createdAt_idx" ON "PvpMatch"("attackerId", "createdAt");

-- CreateIndex
CREATE INDEX "PvpMatch_defenderId_createdAt_idx" ON "PvpMatch"("defenderId", "createdAt");

-- AddForeignKey
ALTER TABLE "PvpMatch" ADD CONSTRAINT "PvpMatch_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpMatch" ADD CONSTRAINT "PvpMatch_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
