import type { Prisma } from "@prisma/client";
import {
  getArmorFieldValue,
  getArmorInstanceFieldValue,
  loadMinionArmorIds,
  setMinionArmorInstanceSlot,
  setMinionArmorSlot,
} from "@/server/minionArmorDb";
import { assertMinionCanEquipBaseItem } from "@/server/minionEquipLevelCheck";
import { minionCombatPowerForEquip } from "@/server/knightOrder";
import { getArmorStats } from "@/shared/armorStatsData";
import { assertEquipmentNotUserLocked } from "@/server/inventoryEquipmentLock";
import { takeAvailableFromStack } from "@/server/inventoryStackOps";
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
  await takeAvailableFromStack(tx, userId, itemId, 1);
}

async function clearSlot(tx: Tx, userId: string, minionId: string, field: ReturnType<typeof armorSlotToDbField>, row: Awaited<ReturnType<typeof loadMinionArmorIds>>) {
  if (!row) return;
  const currentItemId = getArmorFieldValue(row, field);
  const currentInstanceId = getArmorInstanceFieldValue(row, field);
  if (currentItemId) {
    await returnStack(tx, userId, currentItemId);
  }
  if (currentInstanceId) {
    await tx.armorInstance.update({
      where: { id: currentInstanceId },
      data: { status: "OWNED" },
    });
  }
  await setMinionArmorSlot(tx, minionId, field, null);
  await setMinionArmorInstanceSlot(tx, minionId, field, null);
}

export async function equipMinionArmor(input: {
  tx: Tx;
  userId: string;
  minionId: string;
  slotId: MinionEquipSlotId;
  itemId?: string | null;
  armorInstanceId?: string | null;
}) {
  const { tx, userId, minionId, slotId } = input;
  const itemId = input.itemId ?? null;
  const armorInstanceId = input.armorInstanceId ?? null;
  if (!isArmorEquipSlot(slotId)) throw new Error("INVALID_ARMOR_SLOT");
  if (itemId && armorInstanceId) throw new Error("BAD_REQUEST");

  const m = await tx.minion.findUnique({
    where: { id: minionId },
  });
  if (!m) throw new Error("MINION_NOT_FOUND");
  if (m.userId !== userId) throw new Error("FORBIDDEN");

  const armorRow = await loadMinionArmorIds(tx, minionId);
  if (!armorRow) throw new Error("ARMOR_SLOTS_NOT_MIGRATED");

  const field = armorSlotToDbField(slotId);

  if (itemId == null && armorInstanceId == null) {
    await clearSlot(tx, userId, minionId, field, armorRow);
    return { ok: true as const, slotId, itemId: null, armorInstanceId: null };
  }

  if (armorInstanceId) {
    const inst = await tx.armorInstance.findUnique({ where: { id: armorInstanceId } });
    if (!inst || inst.userId !== userId) throw new Error("ARMOR_INSTANCE_NOT_FOUND");
    if (inst.status !== "OWNED") throw new Error("ARMOR_INSTANCE_NOT_AVAILABLE");
    assertEquipmentNotUserLocked(inst);
    if (!armorStackMatchesSlot(slotId, inst.baseItemId)) throw new Error("ARMOR_SLOT_MISMATCH");
    if (!getArmorStats(inst.baseItemId)) throw new Error("ARMOR_STATS_NOT_FOUND");
    const combatPower = await minionCombatPowerForEquip(tx, userId, m);
    assertMinionCanEquipBaseItem({
      minionCombatPower: combatPower,
      baseItemId: inst.baseItemId,
      instanceItemLevel: inst.itemLevel,
    });

    const currentInstanceId = getArmorInstanceFieldValue(armorRow, field);
    if (currentInstanceId === armorInstanceId) {
      return { ok: true as const, slotId, itemId: null, armorInstanceId };
    }

    await clearSlot(tx, userId, minionId, field, armorRow);
    await setMinionArmorInstanceSlot(tx, minionId, field, armorInstanceId);
    return { ok: true as const, slotId, itemId: null, armorInstanceId };
  }

  if (!armorStackMatchesSlot(slotId, itemId!)) throw new Error("ARMOR_SLOT_MISMATCH");
  if (!getArmorStats(itemId!)) throw new Error("ARMOR_STATS_NOT_FOUND");
  const combatPower = await minionCombatPowerForEquip(tx, userId, m);
  assertMinionCanEquipBaseItem({ minionCombatPower: combatPower, baseItemId: itemId! });

  const item = await tx.item.findUnique({ where: { id: itemId! } });
  if (!item) throw new Error("ITEM_NOT_FOUND");
  if (item.category !== "방어구" && !itemId!.startsWith("armor_")) throw new Error("NOT_ARMOR");

  const currentItemId = getArmorFieldValue(armorRow, field);
  if (currentItemId === itemId) {
    return { ok: true as const, slotId, itemId, armorInstanceId: null };
  }

  await clearSlot(tx, userId, minionId, field, armorRow);
  await takeStack(tx, userId, itemId!);
  await setMinionArmorSlot(tx, minionId, field, itemId);

  return { ok: true as const, slotId, itemId, armorInstanceId: null };
}
