import { prisma, assertRowsUpdated } from "@/server/db";
import type { DungeonDef } from "@/server/dungeonData";
import { grantDungeonRunGold } from "@/server/dungeonGoldEarn";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import {
  enrichLootEntries,
  mergeLoot,
  safeParsePendingLoot,
} from "@/server/dungeonRun";
import type { LootEntry } from "@/server/dungeonRun";
import { idleBalancedDrops, idleRollFloorForStage } from "@/server/dungeonIdleDrops";
import {
  CRAFTING_ITEM_GRADE,
  craftingDropRowsForContext,
  maxCraftingGradeForTier,
} from "@/shared/craftingItemDrops";
import {
  DUNGEON_IDLE_RULES,
  idleGoldPerRoll,
  idleRollIntervalSecondsForStage,
  idleXpPerRoll,
} from "@/shared/dungeonIdle";
import { stageOrderForDungeonId } from "@/shared/dungeonStageProgression";
import { normalizeItemIdLower } from "@/shared/itemId";

import { assertDungeonPartyEligible } from "@/server/dungeonRun";

function pickWeightedIndex(weights: number[], rnd = Math.random) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function randIntInclusive(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function rollIdleDrops(dungeon: DungeonDef, rolls: number, stageOrder: number, rnd = Math.random): LootEntry[] {
  const lootMap = new Map<string, number>();
  if (rolls <= 0) return [];

  const virtualFloor = idleRollFloorForStage(stageOrder);
  const basePool = idleBalancedDrops(dungeon.drops).filter((d) => {
    const minF = d.minFloor ?? 1;
    const maxF = d.maxFloor ?? Number.MAX_SAFE_INTEGER;
    return minF <= virtualFloor && virtualFloor <= maxF;
  });

  const crafting = craftingDropRowsForContext({
    tier: stageOrder,
    maxFloors: dungeon.maxFloors ?? 20,
    boss: false,
  });

  const pool = [...basePool, ...crafting];
  if (!pool.length) return [];

  const weights = pool.map((d) => d.weight);
  for (let i = 0; i < rolls; i++) {
    const idx = pickWeightedIndex(weights, rnd);
    if (idx < 0) continue;
    const entry = pool[idx]!;
    const itemId = normalizeItemIdLower(entry.itemId);
    if (!itemId) continue;
    const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
    lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);

    if (rnd() < DUNGEON_IDLE_RULES.rareCraftingBonusChance) {
      const bonusTier = Math.min(8, stageOrder + 1);
      const maxGrade = maxCraftingGradeForTier(bonusTier);
      const highCraft = craftingDropRowsForContext({
        tier: bonusTier,
        maxFloors: dungeon.maxFloors ?? 20,
        boss: true,
      }).filter((row) => (CRAFTING_ITEM_GRADE[row.itemId] ?? 0) >= Math.min(6, maxGrade));
      if (highCraft.length) {
        const w2 = highCraft.map((d) => d.weight);
        const j = pickWeightedIndex(w2, rnd);
        if (j >= 0) {
          const bonus = highCraft[j]!;
          const bid = normalizeItemIdLower(bonus.itemId);
          lootMap.set(bid, (lootMap.get(bid) ?? 0) + randIntInclusive(bonus.minQty, bonus.maxQty, rnd));
        }
      }
    }
  }

  return Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));
}

export type IdleRunState = {
  ok: true;
  active: boolean;
  run?: {
    id: string;
    dungeonId: string;
    wins: number;
    startedAt: string;
    lastTickAt: string;
    rollIntervalSeconds: number;
    nextRollAt: string | null;
    offlineCapSeconds: number;
  };
  dungeon?: Pick<DungeonDef, "id" | "name" | "mode">;
  party?: Array<{ minionId: string }>;
  pendingLootItems?: Awaited<ReturnType<typeof enrichLootEntries>>;
  pendingGold?: number;
  rollsApplied?: number;
  goldGained?: number;
  xpGained?: number;
};

function computeDueRolls(lastTickAt: Date, now: Date, intervalSec: number) {
  const capMs = DUNGEON_IDLE_RULES.offlineCapSeconds * 1000;
  const elapsedMs = Math.min(capMs, Math.max(0, now.getTime() - lastTickAt.getTime()));
  const intervalMs = intervalSec * 1000;
  const rolls = Math.floor(elapsedMs / intervalMs);
  const remainder = elapsedMs % intervalMs;
  const nextAt =
    rolls > 0
      ? new Date(now.getTime() + (intervalMs - remainder))
      : new Date(lastTickAt.getTime() + intervalMs);
  return { rolls, nextAt };
}

export async function createIdleDungeonRun(input: {
  userId: string;
  dungeon: DungeonDef;
  minionIds: string[];
}) {
  if (input.dungeon.mode !== "IDLE") throw new Error("NOT_IDLE_DUNGEON");

  const ids = Array.from(new Set(input.minionIds.map((x) => x.trim()).filter(Boolean)));
  const maxParty = input.dungeon.maxPartySize ?? 1;
  if (!ids.length || ids.length > maxParty) throw new Error("PARTY_TOO_LARGE");

  await assertDungeonPartyEligible(input.userId, input.dungeon, ids);

  const run = await prisma.$transaction(async (tx) => {
    await tx.dungeonRun.updateMany({
      where: { userId: input.userId, status: "RUNNING" },
      data: { status: "STOPPED" },
    });
    const minions = await tx.minion.findMany({
      where: { id: { in: ids }, userId: input.userId },
      select: { id: true },
    });
    if (minions.length !== ids.length) throw new Error("MINION_NOT_FOUND");

    return tx.dungeonRun.create({
      data: {
        userId: input.userId,
        dungeonId: input.dungeon.id,
        status: "RUNNING",
        startedAt: new Date(),
        lastTickAt: new Date(),
        party: { create: ids.map((minionId) => ({ minionId })) },
      },
      include: { party: true },
    });
  });

  return { ok: true as const, runId: run.id };
}

async function buildIdleState(
  userId: string,
  dungeon: DungeonDef,
  extra?: {
    rollsApplied?: number;
    goldGained?: number;
    xpGained?: number;
    nextRollAt?: Date;
    rollIntervalSeconds?: number;
  },
): Promise<IdleRunState> {
  const run = await prisma.dungeonRun.findFirst({
    where: { userId, dungeonId: dungeon.id, status: "RUNNING" },
    include: { party: true },
    orderBy: { startedAt: "desc" },
  });

  if (!run) return { ok: true, active: false };

  const stageOrder = stageOrderForDungeonId(dungeon.id) ?? 1;
  const intervalSec = extra?.rollIntervalSeconds ?? idleRollIntervalSecondsForStage(stageOrder);
  const { nextAt } = computeDueRolls(run.lastTickAt, new Date(), intervalSec);
  const pending = safeParsePendingLoot(run.pendingLootJson);
  const pendingLootItems = await enrichLootEntries(prisma, pending);

  return {
    ok: true,
    active: true,
    run: {
      id: run.id,
      dungeonId: run.dungeonId,
      wins: run.wins,
      startedAt: run.startedAt.toISOString(),
      lastTickAt: run.lastTickAt.toISOString(),
      rollIntervalSeconds: intervalSec,
      nextRollAt: (extra?.nextRollAt ?? nextAt).toISOString(),
      offlineCapSeconds: DUNGEON_IDLE_RULES.offlineCapSeconds,
    },
    dungeon: { id: dungeon.id, name: dungeon.name, mode: dungeon.mode },
    party: run.party.map((p) => ({ minionId: p.minionId })),
    pendingLootItems,
    pendingGold: run.pendingGold,
    rollsApplied: extra?.rollsApplied,
    goldGained: extra?.goldGained,
    xpGained: extra?.xpGained,
  };
}

export async function tickIdleDungeonRun(userId: string, dungeon: DungeonDef) {
  if (dungeon.mode !== "IDLE") throw new Error("NOT_IDLE_DUNGEON");

  const run = await prisma.dungeonRun.findFirst({
    where: { userId, dungeonId: dungeon.id, status: "RUNNING" },
    include: { party: true },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return buildIdleState(userId, dungeon);

  const stageOrder = stageOrderForDungeonId(dungeon.id) ?? 1;
  const intervalSec = idleRollIntervalSecondsForStage(stageOrder);
  const now = new Date();
  const { rolls, nextAt } = computeDueRolls(run.lastTickAt, now, intervalSec);

  let goldGained = 0;
  let xpGained = 0;

  if (rolls > 0) {
    const lootGained = rollIdleDrops(dungeon, rolls, stageOrder);
    goldGained = rolls * idleGoldPerRoll(idleRollFloorForStage(stageOrder), stageOrder);
    xpGained = rolls * idleXpPerRoll(stageOrder);

    const pending = safeParsePendingLoot(run.pendingLootJson);
    const nextPending = mergeLoot(pending, lootGained);
    const nextGold = Math.max(0, run.pendingGold) + goldGained;

    assertRowsUpdated(
      (
        await prisma.dungeonRun.updateMany({
          where: { id: run.id, status: "RUNNING", lastTickAt: run.lastTickAt },
          data: {
            lastTickAt: now,
            wins: { increment: rolls },
            pendingLootJson: JSON.stringify(nextPending),
            pendingGold: nextGold,
          },
        })
      ).count,
    );

    const partyMinionIds = run.party.map((p) => p.minionId);
    if (partyMinionIds.length && xpGained > 0) {
      const xpEach = Math.max(1, Math.floor(xpGained / partyMinionIds.length));
      await grantMinionsExperience(prisma, partyMinionIds, xpEach);
    }
  }

  return buildIdleState(userId, dungeon, {
    rollsApplied: rolls,
    goldGained,
    xpGained,
    nextRollAt: nextAt,
    rollIntervalSeconds: intervalSec,
  });
}

export async function getIdleDungeonState(userId: string, dungeon: DungeonDef) {
  return tickIdleDungeonRun(userId, dungeon);
}

export async function collectIdleDungeonRun(userId: string, dungeon: DungeonDef) {
  await tickIdleDungeonRun(userId, dungeon);

  const run = await prisma.dungeonRun.findFirst({
    where: { userId, dungeonId: dungeon.id, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_RUN");

  const pending = safeParsePendingLoot(run.pendingLootJson);
  const gold = Math.max(0, run.pendingGold);

  await prisma.dungeonRun.update({
    where: { id: run.id },
    data: {
      status: "STOPPED",
      pendingLootJson: "[]",
      pendingGold: 0,
    },
  });

  if (pending.length) await grantLootToUser(prisma, userId, pending);
  if (gold > 0) {
    await grantDungeonRunGold(prisma, { userId, dungeonId: dungeon.id, amount: gold });
  }

  const cashedOut = await enrichLootEntries(prisma, pending);
  return { ok: true as const, cashedOut, goldGained: gold };
}
