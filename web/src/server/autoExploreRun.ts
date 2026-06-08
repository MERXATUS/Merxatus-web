import { prisma, assertRowsUpdated } from "@/server/db";
import { loadDungeons, type DungeonDef } from "@/server/dungeonData";
import { loadPartyCombatRows } from "@/server/minionCombatBuild";
import { resolveFloorMonster } from "@/server/dungeonEncounters";
import { computeWinRate } from "@/server/dungeonCombat";
import { combatPowerFromMonster } from "@/server/monsterCombat";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import { dungeonAutoWaveXpForStage } from "@/shared/dungeonStageProgression";
import {
  autoExploreDailyWaveCap,
  autoExploreSpeedMult,
  autoExploreWaveSeconds,
  type AutoExploreSpeedTier,
} from "@/shared/autoExplore";
import { normalizeItemIdLower } from "@/shared/itemId";

export function autoExploreDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** v1: 항상 무료 티어 — BM·패스 연동은 후속 */
export async function resolveAutoExploreSpeedTier(_userId: string): Promise<AutoExploreSpeedTier> {
  return "free";
}

export async function getAutoExploreDailyUsage(userId: string, tier: AutoExploreSpeedTier) {
  const key = autoExploreDayKey();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoExploreDailyWaves: true, autoExploreDayKey: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const wavesUsed = user.autoExploreDayKey === key ? user.autoExploreDailyWaves : 0;
  const cap = autoExploreDailyWaveCap(tier);
  return {
    dayKey: key,
    wavesUsed,
    cap,
    remaining: Math.max(0, cap - wavesUsed),
    speedTier: tier,
    speedMult: autoExploreSpeedMult(tier),
  };
}

async function addDailyWaveUsage(userId: string, waves: number, dayKey: string) {
  if (waves <= 0) return;
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { autoExploreDailyWaves: true, autoExploreDayKey: true },
    });
    if (!user) return;
    const base = user.autoExploreDayKey === dayKey ? user.autoExploreDailyWaves : 0;
    await tx.user.update({
      where: { id: userId },
      data: {
        autoExploreDayKey: dayKey,
        autoExploreDailyWaves: base + waves,
      },
    });
  });
}

function randIntInclusive(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function pickWeightedIndex(weights: number[], rnd: () => number) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

type CreateAutoExploreResult =
  | { ok: false; error: "DUNGEON_NOT_FOUND" | "MINION_NOT_FOUND" | "PARTY_TOO_LARGE" | "DAILY_WAVE_CAP_REACHED" }
  | { ok: true; runId: string; dungeon: DungeonDef };

export async function createAutoExploreRun(input: {
  userId: string;
  dungeonId: string;
  minionIds: string[];
}): Promise<CreateAutoExploreResult> {
  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === input.dungeonId);
  if (!dungeon) return { ok: false, error: "DUNGEON_NOT_FOUND" };

  const ids = Array.from(
    new Set(input.minionIds.map((x) => String(x).trim()).filter((x) => x.length > 0)),
  );
  const maxParty = dungeon.maxPartySize ?? 1;
  if (ids.length === 0 || ids.length > maxParty) {
    return { ok: false, error: "PARTY_TOO_LARGE" };
  }

  const tier = await resolveAutoExploreSpeedTier(input.userId);
  const daily = await getAutoExploreDailyUsage(input.userId, tier);
  if (daily.remaining <= 0) return { ok: false, error: "DAILY_WAVE_CAP_REACHED" };

  const run = await prisma.$transaction(async (tx) => {
    await tx.dungeonRun.updateMany({
      where: { userId: input.userId, status: "RUNNING" },
      data: { status: "STOPPED" },
    });

    const minions = await tx.minion.findMany({
      where: { id: { in: ids }, userId: input.userId },
      select: { id: true },
      take: 20,
    });
    if (minions.length !== ids.length) {
      return { ok: false as const, error: "MINION_NOT_FOUND" as const };
    }

    const created = await tx.dungeonRun.create({
      data: {
        userId: input.userId,
        dungeonId: dungeon.id,
        status: "RUNNING",
        autoExplore: true,
        startedAt: new Date(),
        lastTickAt: new Date(),
        party: { create: ids.map((id) => ({ minionId: id })) },
      },
    });
    return { ok: true as const, runId: created.id };
  });

  if (!run.ok) return run;
  return { ok: true, runId: run.runId, dungeon };
}

export async function stopAutoExploreRun(userId: string) {
  const run = await prisma.dungeonRun.findFirst({
    where: { userId, status: "RUNNING", autoExplore: true },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_AUTO_RUN");

  await prisma.dungeonRun.update({
    where: { id: run.id },
    data: { status: "STOPPED" },
  });
  return { ok: true as const, runId: run.id };
}

export async function tickAutoExploreRun(input: { userId: string; commitLoot: boolean }) {
  const tier = await resolveAutoExploreSpeedTier(input.userId);
  const daily = await getAutoExploreDailyUsage(input.userId, tier);
  if (daily.remaining <= 0) {
    return {
      ok: true as const,
      runId: null as string | null,
      progressedWaves: 0,
      winsAdded: 0,
      lossesAdded: 0,
      winRate: null as number | null,
      loot: [] as Array<{ itemId: string; qty: number }>,
      dailyCapReached: true,
    };
  }

  const now = new Date();
  const run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: "RUNNING", autoExplore: true },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_AUTO_RUN");

  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === run.dungeonId);
  if (!dungeon) throw new Error("DUNGEON_DEF_MISSING");

  const waveSeconds = autoExploreWaveSeconds(dungeon.baseWaveSeconds, daily.speedMult);
  const last = new Date(run.lastTickAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - last) / 1000));
  const rawWaves = Math.floor(elapsedSec / waveSeconds);
  const waves = Math.min(rawWaves, daily.remaining);

  if (waves <= 0) {
    const nextWaveInSec = waveSeconds - (elapsedSec % waveSeconds);
    return {
      ok: true as const,
      runId: run.id,
      progressedWaves: 0,
      winsAdded: 0,
      lossesAdded: 0,
      winRate: null as number | null,
      loot: [] as Array<{ itemId: string; qty: number }>,
      nextWaveInSec,
      dailyCapReached: false,
    };
  }

  const { partyPower } = await loadPartyCombatRows(prisma, input.userId, run.party);
  const waveMonster = await resolveFloorMonster(dungeon, 1);
  const winRate = computeWinRate({
    partyPower,
    enemyPower: combatPowerFromMonster(waveMonster.monster),
  });

  let winsAdded = 0;
  let lossesAdded = 0;
  const rnd = Math.random;
  for (let i = 0; i < waves; i++) {
    if (rnd() < winRate) winsAdded += 1;
    else lossesAdded += 1;
  }

  const lootMap = new Map<string, number>();
  if (winsAdded > 0) {
    const weights = dungeon.drops.map((d) => d.weight);
    for (let i = 0; i < winsAdded; i++) {
      const idx = pickWeightedIndex(weights, rnd);
      if (idx < 0) continue;
      const entry = dungeon.drops[idx]!;
      const itemId = normalizeItemIdLower(entry.itemId);
      if (!itemId) continue;
      const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
      lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);
    }
  }

  const advancedSec = waves * waveSeconds;
  const nextLast = new Date(new Date(run.lastTickAt).getTime() + advancedSec * 1000);

  assertRowsUpdated(
    (
      await prisma.dungeonRun.updateMany({
        where: { id: run.id, status: "RUNNING", lastTickAt: run.lastTickAt },
        data: {
          lastTickAt: nextLast,
          wins: { increment: winsAdded },
          losses: { increment: lossesAdded },
        },
      })
    ).count,
  );

  await addDailyWaveUsage(input.userId, waves, daily.dayKey);

  const partyMinionIds = run.party.map((p) => p.minionId);
  const maxFloors = dungeon.maxFloors ?? 20;
  const minionXpGrants =
    winsAdded > 0
      ? await grantMinionsExperience(
          prisma,
          partyMinionIds,
          winsAdded * dungeonAutoWaveXpForStage(dungeon.id, maxFloors),
        )
      : [];

  if (input.commitLoot) {
    await grantLootToUser(
      prisma,
      input.userId,
      [...lootMap.entries()].map(([itemId, qty]) => ({ itemId, qty })),
    );
  }

  const loot = Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));

  return {
    ok: true as const,
    runId: run.id,
    progressedWaves: waves,
    winsAdded,
    lossesAdded,
    winRate,
    partyPower,
    loot,
    minionXpGrants,
    dailyCapReached: daily.remaining - waves <= 0,
  };
}

export async function getAutoExploreState(userId: string) {
  const tier = await resolveAutoExploreSpeedTier(userId);
  const daily = await getAutoExploreDailyUsage(userId, tier);

  const run = await prisma.dungeonRun.findFirst({
    where: { userId, status: "RUNNING", autoExplore: true },
    orderBy: { startedAt: "desc" },
    include: { party: { include: { minion: true } } },
  });

  if (!run) {
    return {
      ok: true as const,
      active: false as const,
      dailyWavesUsed: daily.wavesUsed,
      dailyWaveCap: daily.cap,
      dailyWavesRemaining: daily.remaining,
      speedTier: daily.speedTier,
      speedMult: daily.speedMult,
    };
  }

  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === run.dungeonId);
  if (!dungeon) throw new Error("DUNGEON_DEF_MISSING");

  const waveSeconds = autoExploreWaveSeconds(dungeon.baseWaveSeconds, daily.speedMult);
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - new Date(run.lastTickAt).getTime()) / 1000));
  const availableWaves = Math.min(Math.floor(elapsedSec / waveSeconds), daily.remaining);
  const nextWaveInSec =
    availableWaves > 0 ? 0 : Math.max(1, waveSeconds - (elapsedSec % waveSeconds));

  const { partyPower } = await loadPartyCombatRows(prisma, userId, run.party);
  const waveMonster = await resolveFloorMonster(dungeon, 1);
  const winRate = computeWinRate({
    partyPower,
    enemyPower: combatPowerFromMonster(waveMonster.monster),
  });

  const weaponInstanceIds = run.party
    .map((p) => p.minion.equippedWeaponInstanceId)
    .filter(Boolean) as string[];
  const weapons = weaponInstanceIds.length
    ? await prisma.weaponInstance.findMany({
        where: { id: { in: weaponInstanceIds }, userId },
        include: { baseItem: true },
        take: 50,
      })
    : [];
  const weaponById = new Map(weapons.map((w) => [w.id, w]));

  return {
    ok: true as const,
    active: true as const,
    run: {
      id: run.id,
      dungeonId: run.dungeonId,
      wins: run.wins,
      losses: run.losses,
      startedAt: run.startedAt,
      lastTickAt: run.lastTickAt,
    },
    dungeon: {
      id: dungeon.id,
      name: dungeon.name,
      baseWaveSeconds: dungeon.baseWaveSeconds,
      maxPartySize: dungeon.maxPartySize,
      maxFloors: dungeon.maxFloors,
    },
    party: run.party.map((p) => ({
      minionId: p.minionId,
      weaponItemId: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.baseItemId ?? null,
      weaponLevel: weaponById.get(p.minion.equippedWeaponInstanceId ?? "")?.enhanceLevel ?? 0,
    })),
    combat: { partyPower, winRate },
    waveSeconds,
    speedMult: daily.speedMult,
    speedTier: daily.speedTier,
    availableWaves,
    nextWaveInSec,
    dailyWavesUsed: daily.wavesUsed,
    dailyWaveCap: daily.cap,
    dailyWavesRemaining: daily.remaining,
  };
}
