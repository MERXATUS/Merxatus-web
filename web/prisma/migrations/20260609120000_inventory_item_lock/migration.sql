-- 스택 재료 잠금 수량 + 장비 사용자 잠금
ALTER TABLE "InventoryStack" ADD COLUMN "lockedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WeaponInstance" ADD COLUMN "userLocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ArmorInstance" ADD COLUMN "userLocked" BOOLEAN NOT NULL DEFAULT false;
