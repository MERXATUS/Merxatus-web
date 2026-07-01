import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { grantLootToUser } from "@/server/grantLootToUser";
import { mergeLoot } from "@/server/dungeonRun";
import { assertCanGrantEquipment } from "@/server/equipmentCapacity";
import { getItemIconMap, itemIconFieldsFromMap } from "@/server/itemCatalog";
import { readItemsJson } from "@/server/adminData";
import { getUserHighestDungeonStageOrder } from "@/server/gachaShopUnlock";
import {
  gachaPullCostGold,
  getGachaPool,
  isGachaPoolUnlocked,
  listGachaPools,
  rollGachaBatch,
  type GachaPoolDef,
  type GachaRoll,
} from "@/shared/gachaShop";
import { normalizeItemIdLower } from "@/shared/itemId";

export type GachaRewardRow = {
  kind: GachaRoll["kind"];
  itemId: string | null;
  name: string;
  qty: number;
  grade: number;
  icon: string | null;
  iconSrc: string;
};

function countEquipmentInRolls(rolls: GachaRoll[]): number {
  return rolls.reduce((n, r) => n + (r.kind === "equipment" ? 1 : 0), 0);
}

function lootFromRolls(rolls: GachaRoll[]) {
  const lootMap = new Map<string, number>();
  let goldGained = 0;
  for (const roll of rolls) {
    if (roll.kind === "gold") {
      goldGained += roll.gold;
      continue;
    }
    const itemId = normalizeItemIdLower(roll.itemId);
    if (!itemId) continue;
    lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + roll.qty);
  }
  const loot = Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));
  return { loot, goldGained };
}

async function loadItemNameGradeMap() {
  const { data } = await readItemsJson();
  return new Map(data.map((it) => [it.id, { name: it.name, grade: it.grade ?? 1 }]));
}

export async function enrichGachaRolls(rolls: GachaRoll[]): Promise<GachaRewardRow[]> {
  const [nameGrade, iconMap] = await Promise.all([loadItemNameGradeMap(), getItemIconMap()]);
  return rolls.map((roll) => {
    if (roll.kind === "gold") {
      return {
        kind: "gold" as const,
        itemId: null,
        name: "골드",
        qty: roll.gold,
        grade: 1,
        icon: null,
        iconSrc: "",
      };
    }
    const itemId = normalizeItemIdLower(roll.itemId) ?? roll.itemId;
    const meta = nameGrade.get(itemId);
    const { icon, iconSrc } = itemIconFieldsFromMap(itemId, iconMap);
    return {
      kind: roll.kind,
      itemId,
      name: meta?.name ?? itemId,
      qty: roll.qty,
      grade: meta?.grade ?? 1,
      icon,
      iconSrc,
    };
  });
}

export async function getGachaShopState(userId: string) {
  const [wallet, highestDungeonStageOrder] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { goldAvailable: true } }),
    getUserHighestDungeonStageOrder(userId),
  ]);
  return {
    ok: true as const,
    goldAvailable: wallet?.goldAvailable ?? 0,
    highestDungeonStageOrder,
    pools: listGachaPools().map((pool) => ({
      id: pool.id,
      name: pool.name,
      description: pool.description,
      singleCostGold: pool.singleCostGold,
      multiCount: pool.multiCount,
      multiCostGold: pool.multiCostGold,
      multiGuaranteeEquipment: pool.multiGuaranteeEquipment ?? false,
      multiGuaranteeMinGrade: pool.multiGuaranteeMinGrade ?? null,
      unlockMinStageOrder: pool.unlockMinStageOrder ?? 1,
      unlocked: isGachaPoolUnlocked(pool, highestDungeonStageOrder),
    })),
  };
}

type GachaTx = Pick<PrismaClient, "wallet" | "weaponInstance" | "armorInstance" | "item" | "inventoryStack">;

export async function pullGachaShop(input: {
  userId: string;
  poolId: string;
  count: number;
}): Promise<{
  ok: true;
  poolId: string;
  pulls: number;
  goldSpent: number;
  goldGained: number;
  goldAvailable: number;
  rewards: GachaRewardRow[];
}> {
  const pool = getGachaPool(input.poolId);
  if (!pool) throw new Error("UNKNOWN_POOL");

  const highestStage = await getUserHighestDungeonStageOrder(input.userId);
  if (!isGachaPoolUnlocked(pool, highestStage)) throw new Error("POOL_LOCKED");

  const pulls = input.count === pool.multiCount ? pool.multiCount : 1;
  const goldSpent = gachaPullCostGold(pool, pulls);
  const rolls = rollGachaBatch(pool, pulls);
  const { loot, goldGained } = lootFromRolls(rolls);
  const equipToAdd = countEquipmentInRolls(rolls);

  const result = await prisma.$transaction(async (tx) => {
    await assertCanGrantEquipment(tx, input.userId, equipToAdd);

    const wallet = await tx.wallet.findUnique({ where: { userId: input.userId } });
    if (!wallet) throw new Error("WALLET_NOT_FOUND");
    if (wallet.goldAvailable < goldSpent) throw new Error("INSUFFICIENT_GOLD");

    await tx.wallet.update({
      where: { userId: input.userId },
      data: { goldAvailable: { decrement: goldSpent } },
    });

    if (loot.length > 0) {
      await grantLootToUser(tx as GachaTx, input.userId, mergeLoot([], loot));
    }

    if (goldGained > 0) {
      await tx.wallet.update({
        where: { userId: input.userId },
        data: { goldAvailable: { increment: goldGained } },
      });
    }

    const after = await tx.wallet.findUnique({
      where: { userId: input.userId },
      select: { goldAvailable: true },
    });

    return { goldAvailable: after?.goldAvailable ?? 0 };
  });

  const rewards = await enrichGachaRolls(rolls);
  return {
    ok: true,
    poolId: pool.id,
    pulls,
    goldSpent,
    goldGained,
    goldAvailable: result.goldAvailable,
    rewards,
  };
}

export function gachaPoolForServer(poolId: string): GachaPoolDef | null {
  return getGachaPool(poolId);
}
