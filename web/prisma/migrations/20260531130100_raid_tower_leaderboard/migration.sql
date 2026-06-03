-- Raid / Tower / Leaderboard (P3-P4 scaffold)

CREATE TYPE "RaidRunStatus" AS ENUM ('RUNNING', 'STOPPED', 'CLEARED', 'FAILED');
CREATE TYPE "TowerRunStatus" AS ENUM ('RUNNING', 'STOPPED');

CREATE TABLE "RaidRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "raidId" TEXT NOT NULL,
    "status" "RaidRunStatus" NOT NULL DEFAULT 'RUNNING',
    "phase" INTEGER NOT NULL DEFAULT 1,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "pendingLootJson" TEXT NOT NULL DEFAULT '[]',
    "partyHpJson" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaidRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RaidPartyMember" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "minionId" TEXT NOT NULL,
    CONSTRAINT "RaidPartyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TowerRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TowerRunStatus" NOT NULL DEFAULT 'RUNNING',
    "seasonKey" TEXT NOT NULL DEFAULT 'default',
    "floor" INTEGER NOT NULL DEFAULT 1,
    "bestFloor" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "pendingLootJson" TEXT NOT NULL DEFAULT '[]',
    "partyHpJson" TEXT NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TowerRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TowerPartyMember" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "minionId" TEXT NOT NULL,
    CONSTRAINT "TowerPartyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "boardKey" TEXT NOT NULL,
    "seasonKey" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "displayName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RaidPartyMember_runId_minionId_key" ON "RaidPartyMember"("runId", "minionId");
CREATE INDEX "RaidPartyMember_runId_idx" ON "RaidPartyMember"("runId");
CREATE INDEX "RaidPartyMember_minionId_idx" ON "RaidPartyMember"("minionId");
CREATE INDEX "RaidRun_userId_status_idx" ON "RaidRun"("userId", "status");
CREATE INDEX "RaidRun_raidId_idx" ON "RaidRun"("raidId");

CREATE UNIQUE INDEX "TowerPartyMember_runId_minionId_key" ON "TowerPartyMember"("runId", "minionId");
CREATE INDEX "TowerPartyMember_runId_idx" ON "TowerPartyMember"("runId");
CREATE INDEX "TowerPartyMember_minionId_idx" ON "TowerPartyMember"("minionId");
CREATE INDEX "TowerRun_userId_status_idx" ON "TowerRun"("userId", "status");
CREATE INDEX "TowerRun_seasonKey_idx" ON "TowerRun"("seasonKey");

CREATE UNIQUE INDEX "LeaderboardEntry_boardKey_seasonKey_userId_key" ON "LeaderboardEntry"("boardKey", "seasonKey", "userId");
CREATE INDEX "LeaderboardEntry_boardKey_seasonKey_score_idx" ON "LeaderboardEntry"("boardKey", "seasonKey", "score");

ALTER TABLE "RaidRun" ADD CONSTRAINT "RaidRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaidPartyMember" ADD CONSTRAINT "RaidPartyMember_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RaidRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaidPartyMember" ADD CONSTRAINT "RaidPartyMember_minionId_fkey" FOREIGN KEY ("minionId") REFERENCES "Minion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TowerRun" ADD CONSTRAINT "TowerRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TowerPartyMember" ADD CONSTRAINT "TowerPartyMember_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TowerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TowerPartyMember" ADD CONSTRAINT "TowerPartyMember_minionId_fkey" FOREIGN KEY ("minionId") REFERENCES "Minion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
