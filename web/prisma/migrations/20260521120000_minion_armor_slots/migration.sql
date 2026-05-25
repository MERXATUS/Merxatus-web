-- AlterTable
ALTER TABLE "Minion" ADD COLUMN "equippedHelmetItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedChestItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedPantsItemId" TEXT;
ALTER TABLE "Minion" ADD COLUMN "equippedBootsItemId" TEXT;

-- CreateIndex
CREATE INDEX "Minion_equippedHelmetItemId_idx" ON "Minion"("equippedHelmetItemId");
CREATE INDEX "Minion_equippedChestItemId_idx" ON "Minion"("equippedChestItemId");
CREATE INDEX "Minion_equippedPantsItemId_idx" ON "Minion"("equippedPantsItemId");
CREATE INDEX "Minion_equippedBootsItemId_idx" ON "Minion"("equippedBootsItemId");

-- AddForeignKey
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedHelmetItemId_fkey" FOREIGN KEY ("equippedHelmetItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedChestItemId_fkey" FOREIGN KEY ("equippedChestItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedPantsItemId_fkey" FOREIGN KEY ("equippedPantsItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Minion" ADD CONSTRAINT "Minion_equippedBootsItemId_fkey" FOREIGN KEY ("equippedBootsItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
