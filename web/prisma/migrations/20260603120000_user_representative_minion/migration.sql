-- AlterTable
ALTER TABLE "User" ADD COLUMN "representativeMinionId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_representativeMinionId_fkey" FOREIGN KEY ("representativeMinionId") REFERENCES "Minion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
