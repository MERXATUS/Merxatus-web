import type { Prisma } from "@prisma/client";
import { getArmorFieldValue, loadMinionArmorIds, setMinionArmorSlot } from "@/server/minionArmorDb";
import { getArmorStats } from "@/shared/armorStatsData";
import {
  armorSlotToDbField,
  armorStackMatchesSlot,
  isArmorEquipSlot,
  type MinionEquipSlotId,
} from "@/shared/minionEquipSlots";

type Tx = Prisma.TransactionClient;

async function returnStack(tx: Tx, userId: string, itemId: string) {
  await tx.inventoryStack.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, quantity: 1 },
    update: { quantity: { increment: 1 } },
  });
}

async function takeStack(tx: Tx, userId: string, itemId: string) {
  const stack = await tx.inventoryStack.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (!stack || stack.quantity < 1) throw new Error("INSUFFICIENT_ITEM");
  if (stack.quantity === 1) {
    await tx.inventoryStack.delete({ where: { userId_itemId: { userId, itemId } } });
  } else {
    await tx.inventoryStack.update({
      where: { userId_itemId: { userId, itemId } },
      data: { quantity: { decrement: 1 } },
    });
  }
}

export async function equipMinionArmor(input: {
  tx: Tx;
  userId: string;
  minionId: string;
  slotId: MinionEquipSlotId;
  itemId: string | null;
}) {
  const { tx, userId, minionId, slotId, itemId } = input;
  if (!isArmorEquipSlot(slotId)) throw new Error("INVALID_ARMOR_SLOT");

  const m = await tx.minion.findUnique({ where: { id: minionId }, select: { id: true, userId: true } });
  if (!m) throw new Error("MINION_NOT_FOUND");
  if (m.userId !== userId) throw new Error("FORBIDDEN");

  const armorRow = await loadMinionArmorIds(tx, minionId);
  if (!armorRow) throw new Error("ARMOR_SLOTS_NOT_MIGRATED");

  const field = armorSlotToDbField(slotId);
  const currentItemId = getArmorFieldValue(armorRow, field);

  if (itemId == null) {
    if (!currentItemId) {
      return { ok: true as const, slotId, itemId: null };
    }
    await returnStack(tx, userId, currentItemId);
    await setMinionArmorSlot(tx, minionId, field, null);
    return { ok: true as const, slotId, itemId: null };
  }

  if (!armorStackMatchesSlot(slotId, itemId)) throw new Error("ARMOR_SLOT_MISMATCH");
  if (!getArmorStats(itemId)) throw new Error("ARMOR_STATS_NOT_FOUND");

  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  if (item.category !== "방어구" && !itemId.startsWith("armor_")) throw new Error("NOT_ARMOR");

  if (currentItemId === itemId) {
    return { ok: true as const, slotId, itemId };
  }

  if (currentItemId) {
    await returnStack(tx, userId, currentItemId);
  }

  await takeStack(tx, userId, itemId);
  await setMinionArmorSlot(tx, minionId, field, itemId);

  return { ok: true as const, slotId, itemId };
}
