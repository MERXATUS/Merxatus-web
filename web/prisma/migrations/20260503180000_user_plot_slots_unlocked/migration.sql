-- User 부지 해제 칸 수 (1~3)
ALTER TABLE "User" ADD COLUMN "plotSlotsUnlocked" INTEGER NOT NULL DEFAULT 1;
