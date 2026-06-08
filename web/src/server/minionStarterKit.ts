import type { Prisma, PrismaClient } from "@prisma/client";
import { assertCanGrantEquipment } from "@/server/equipmentCapacity";

export const STARTER_SWORD_ITEM_ID = "weapon_wood_sword";

type StarterDb = Pick<PrismaClient, "minion" | "weaponInstance"> | Prisma.TransactionClient;

export async function grantAndEquipStarterSword(tx: StarterDb, userId: string, minionId: string) {
  await assertCanGrantEquipment(
    tx as Pick<PrismaClient, "weaponInstance" | "armorInstance">,
    userId,
    1,
  );
  const inst = await tx.weaponInstance.create({
    data: {
      userId,
      baseItemId: STARTER_SWORD_ITEM_ID,
      status: "OWNED",
    },
  });
  await tx.minion.update({
    where: { id: minionId },
    data: { equippedWeaponInstanceId: inst.id },
  });
  return inst;
}
