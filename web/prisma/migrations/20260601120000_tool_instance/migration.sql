-- Idempotent: enum/table may exist from prior db push
DO $$ BEGIN
  CREATE TYPE "ToolInstanceStatus" AS ENUM ('OWNED', 'LISTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ToolInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseItemId" TEXT NOT NULL,
    "status" "ToolInstanceStatus" NOT NULL DEFAULT 'OWNED',
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ToolInstance_userId_createdAt_idx" ON "ToolInstance"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ToolInstance_baseItemId_idx" ON "ToolInstance"("baseItemId");

DO $$ BEGIN
  ALTER TABLE "ToolInstance" ADD CONSTRAINT "ToolInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolInstance" ADD CONSTRAINT "ToolInstance_baseItemId_fkey" FOREIGN KEY ("baseItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
