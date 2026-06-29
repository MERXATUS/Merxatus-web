-- AlterTable
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "armorInstanceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Listing_armorInstanceId_key" ON "Listing"("armorInstanceId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Listing" ADD CONSTRAINT "Listing_armorInstanceId_fkey" FOREIGN KEY ("armorInstanceId") REFERENCES "ArmorInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
