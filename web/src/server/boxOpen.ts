import type { PrismaClient } from "@prisma/client";
import { grantLootToUser } from "@/server/grantLootToUser";
import { boxOpenDropsForItem } from "@/server/boxOpenData";
import { isLootBoxItemId, lootBoxRollCount } from "@/shared/boxOpen";

type OpenTx = Pick<PrismaClient, "inventoryStack" | "item" | "weaponInstance" | "armorInstance">;

export type BoxOpenLootEntry = { itemId: string; qty: number; itemName?: string };

function pickWeightedIndex(weights: number[], rnd: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function randIntInclusive(min: number, max: number, rnd: () => number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export async function rollLootFromBoxAsync(
  boxItemId: string,
  rnd: () => number = Math.random,
): Promise<BoxOpenLootEntry[]> {
  const drops = await boxOpenDropsForItem(boxItemId);
  if (drops.length === 0) throw new Error("BOX_TABLE_EMPTY");

  const weights = drops.map((d) => Math.max(0, d.weight));
  const rolls = lootBoxRollCount(boxItemId);
  const produced = new Map<string, number>();

  for (let i = 0; i < rolls; i++) {
    const idx = pickWeightedIndex(weights, rnd);
    if (idx < 0) continue;
    const row = drops[idx]!;
    const qty = randIntInclusive(row.minQty, row.maxQty, rnd);
    produced.set(row.itemId, (produced.get(row.itemId) ?? 0) + qty);
  }

  return Array.from(produced.entries()).map(([itemId, qty]) => ({ itemId, qty }));
}

export async function openLootBoxInTx(
  tx: OpenTx,
  input: { userId: string; boxItemId: string; quantity?: number },
) {
  const boxItemId = input.boxItemId.trim().toLowerCase();
  if (!isLootBoxItemId(boxItemId)) throw new Error("NOT_A_LOOT_BOX");

  const qty = Math.max(1, Math.min(50, Math.floor(input.quantity ?? 1)));

  const stack = await tx.inventoryStack.findUnique({
    where: { userId_itemId: { userId: input.userId, itemId: boxItemId } },
  });
  const have = stack?.quantity ?? 0;
  if (have < qty) throw new Error("NO_BOX");

  const drops = await boxOpenDropsForItem(boxItemId);
  if (drops.length === 0) throw new Error("BOX_TABLE_EMPTY");

  const merged = new Map<string, number>();
  for (let n = 0; n < qty; n++) {
    const rolled = await rollLootFromBoxAsync(boxItemId);
    for (const x of rolled) {
      merged.set(x.itemId, (merged.get(x.itemId) ?? 0) + x.qty);
    }
  }

  await tx.inventoryStack.update({
    where: { userId_itemId: { userId: input.userId, itemId: boxItemId } },
    data: { quantity: { decrement: qty } },
  });

  const loot = Array.from(merged.entries()).map(([itemId, q]) => ({ itemId, qty: q }));
  await grantLootToUser(tx, input.userId, loot);

  const itemIds = loot.map((x) => x.itemId);
  const names = itemIds.length
    ? await tx.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true },
        take: 100,
      })
    : [];
  const nameById = new Map(names.map((it) => [it.id, it.name]));

  const produced = loot.map((x) => ({
    itemId: x.itemId,
    qty: x.qty,
    itemName: nameById.get(x.itemId) ?? x.itemId,
  }));

  return {
    ok: true as const,
    boxItemId,
    openedCount: qty,
    produced,
  };
}
