import type { Prisma } from "@prisma/client";
import { getAccessoryCatalogEntry } from "@/shared/accessoryCatalog";
import { assertMinionCanEquipBaseItem } from "@/server/minionEquipLevelCheck";
import { takeAvailableFromStack } from "@/server/inventoryStackOps";
import {
  accessorySlotToDbField,
  accessoryStackMatchesSlot,
  isAccessoryEquipSlot,
  type MinionAccessorySlotId,
  type MinionEquipSlotId,
} from "@/shared/minionEquipSlots";
import { getAccessoryFieldValue, loadMinionAccessoryIds, setMinionAccessorySlot } from "@/server/minionAccessoryDb";

type Tx = Prisma.TransactionClient;

async function returnStack(tx: Tx, userId: string, itemId: string) {
  await tx.inventoryStack.upsert({
    where: { userId_itemId: { userId, itemId } },
    create: { userId, itemId, quantity: 1 },
    update: { quantity: { increment: 1 } },
  });
}

async function clearAccessorySlot(
  tx: Tx,
  userId: string,
  minionId: string,
  slotId: MinionAccessorySlotId,
  row: NonNullable<Awaited<ReturnType<typeof loadMinionAccessoryIds>>>,
) {
  const field = accessorySlotToDbField(slotId);
  const current = getAccessoryFieldValue(row, slotId);
  if (current) await returnStack(tx, userId, current);
  await setMinionAccessorySlot(tx, minionId, field, null);
}

export async function equipMinionAccessory(input: {
  tx: Tx;
  userId: string;
  minionId: string;
  slotId: MinionEquipSlotId;
  itemId?: string | null;
}) {
  const { tx, userId, minionId, slotId } = input;
  const itemId = input.itemId ?? null;
  if (!isAccessoryEquipSlot(slotId)) throw new Error("INVALID_ACCESSORY_SLOT");

  const m = await tx.minion.findUnique({
    where: { id: minionId },
    select: { id: true, userId: true, level: true },
  });
  if (!m) throw new Error("MINION_NOT_FOUND");
  if (m.userId !== userId) throw new Error("FORBIDDEN");

  const accessoryRow = await loadMinionAccessoryIds(tx, minionId);
  if (!accessoryRow) throw new Error("ACCESSORY_SLOTS_NOT_MIGRATED");

  const field = accessorySlotToDbField(slotId);

  if (!itemId) {
    await clearAccessorySlot(tx, userId, minionId, slotId, accessoryRow);
    return { ok: true as const, slotId, itemId: null };
  }

  if (!accessoryStackMatchesSlot(slotId, itemId)) throw new Error("ACCESSORY_SLOT_MISMATCH");
  const catalog = getAccessoryCatalogEntry(itemId);
  if (!catalog) throw new Error("ACCESSORY_NOT_FOUND");

  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  if (item.category !== "악세서리" && !itemId.startsWith("acc_")) throw new Error("NOT_ACCESSORY");

  assertMinionCanEquipBaseItem({ minionLevel: m.level, baseItemId: itemId, itemGrade: item.grade });

  const current = getAccessoryFieldValue(accessoryRow, slotId);
  if (current === itemId) return { ok: true as const, slotId, itemId };

  await clearAccessorySlot(tx, userId, minionId, slotId, accessoryRow);
  await takeAvailableFromStack(tx, userId, itemId, 1);
  await setMinionAccessorySlot(tx, minionId, field, itemId);

  return { ok: true as const, slotId, itemId };
}
