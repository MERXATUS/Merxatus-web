-- CreateEnum
CREATE TYPE "ArmorInstanceStatus" AS ENUM ('OWNED', 'LISTED');

-- CreateTable
CREATE TABLE "ArmorInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseItemId" TEXT NOT NULL,
    "status" "ArmorInstanceStatus" NOT NULL DEFAULT 'OWNED',
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArmorInstance_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Minion" ADD COLUMN "equippedHelmetInstanceId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedChestInstanceId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedPantsInstanceId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedBootsInstanceId" TEXT;

-- CreateIndex
CREATE INDEX "ArmorInstance_userId_createdAt_idx" ON "ArmorInstance"("userId", "createdAt");
CREATE INDEX "ArmorInstance_baseItemId_idx" ON "ArmorInstance"("baseItemId");
CREATE INDEX "Minion_equippedHelmetInstanceId_idx" ON "Minion"("equippedHelmetInstanceId");
CREATE INDEX "Minion_equippedChestInstanceId_idx" ON "Minion"("equippedChestInstanceId");
CREATE INDEX "Minion_equippedPantsInstanceId_idx" ON "Minion"("equippedPantsInstanceId");
CREATE INDEX "Minion_equippedBootsInstanceId_idx" ON "Minion"("equippedBootsInstanceId");

-- AddForeignKey
ALTER TABLE "ArmorInstance" ADD CONSTRAINT "ArmorInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArmorInstance" ADD CONSTRAINT "ArmorInstance_baseItemId_fkey" FOREIGN KEY ("baseItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedHelmetInstanceId_fkey" FOREIGN KEY ("equippedHelmetInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedChestInstanceId_fkey" FOREIGN KEY ("equippedChestInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedPantsInstanceId_fkey" FOREIGN KEY ("equippedPantsInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedBootsInstanceId_fkey" FOREIGN KEY ("equippedBootsInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
