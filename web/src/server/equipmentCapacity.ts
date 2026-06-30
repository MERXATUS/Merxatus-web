import type { Prisma, PrismaClient } from "@prisma/client";
import { MAX_EQUIPMENT_OWNED } from "@/shared/equipmentCapacity";

type EquipmentDb = Pick<PrismaClient, "weaponInstance" | "armorInstance"> | Prisma.TransactionClient;

export { MAX_EQUIPMENT_OWNED };

export async function countOwnedEquipment(db: EquipmentDb, userId: string) {
  const weaponCount = await db.weaponInstance.count({ where: { userId } });
  const armorCount = await db.armorInstance.count({ where: { userId } });
  return weaponCount + armorCount;
}

export function assertCanAddEquipmentInstances(currentCount: number, toAdd: number) {
  if (toAdd <= 0) return;
  if (currentCount + toAdd > MAX_EQUIPMENT_OWNED) throw new Error("MAX_EQUIPMENT_OWNED");
}

export async function assertCanGrantEquipment(db: EquipmentDb, userId: string, toAdd: number) {
  if (toAdd <= 0) return;
  const current = await countOwnedEquipment(db, userId);
  assertCanAddEquipmentInstances(current, toAdd);
}
