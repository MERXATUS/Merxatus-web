import { prisma } from "@/server/db";
import { buildPartyCombatants, buildFullPartyHp, estimateFloorWinChance, simulateFloorCombat, type FloorEnemy } from "@/server/dungeonBattler";
import { buildCombatReplay } from "@/server/combatReplay";
import { loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { getMonster } from "@/server/monsterData";
import { loadTowerConfig, towerMonsterForFloor, type TowerDef } from "@/server/towerData";
import { safeParsePendingLoot, enrichLootEntries, snapshotsToEntries } from "@/server/dungeonRun";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { pushLuckLootMultiplier, scaleLootEntries } from "@/shared/dungeonPushLuck";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import { grantLootToUser } from "@/server/grantLootToUser";
import { getUserLeaderboardRank, listLeaderboard, upsertLeaderboardScore } from "@/server/leaderboard";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

type LootEntry = { itemId: string; qty: number };

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollTowerDrops(config: TowerDef, rolls: number): LootEntry[] {
  const map = new Map<string, number>();
  if (!config.drops.length || rolls <= 0) return [];
  const weights = config.drops.map((d) => d.weight);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rolls; i++) {
    let r = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < weights.length; j++) {
      r -= weights[j] ?? 0;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    const e = config.drops[idx]!;
    map.set(e.itemId, (map.get(e.itemId) ?? 0) + randInt(e.minQty, e.maxQty));
  }
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

function mergeLoot(a: LootEntry[], b: LootEntry[]) {
  const m = new Map<string, number>();
  for (const x of [...a, ...b]) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.qty);
  return [...m.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

async function loadTowerPartyCombat(db: PartyCombatDb, userId: string, run: { party: Array<{ minionId: string; minion: { level: number; jobType: string; equippedWeaponInstanceId: string | null } }> }) {
  const { memberInputs } = await loadPartyCombatRows(db, userId, run.party);
  return {
    memberInputs,
    combatants: buildPartyCombatants(
      memberInputs.map((x) => ({
        minionId: x.minionId,
        combatClassLabel: x.combatClassLabel,
        power: x.power,
        bonusHp: x.bonusHp,
        bonusDef: x.bonusDef,
      })),
    ),
  };
}

export async function getTowerCombatPreview(userId: string) {
  const config = await loadTowerConfig();
  const run = await prisma.towerRun.findFirst({
    where: { userId, status: "RUNNING", seasonKey: config.seasonKey },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;

  const floor = Math.max(1, run.floor);
  const enc = towerMonsterForFloor(config, floor);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };
  const { combatants } = await loadTowerPartyCombat(prisma, userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHp = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const clearChance = estimateFloorWinChance({
    floor,
    maxFloors: 9999,
    party: combatants,
    enemy,
    partyHp,
    samples: 32,
  });
  return { clearChance, floor, isBoss: enc.category === "Boss" };
}

async function recordTowerBest(userId: string, config: TowerDef, reachedFloor: number) {
  const score = Math.max(0, reachedFloor - 1);
  if (score <= 0) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  await upsertLeaderboardScore({
    userId,
    boardKey: config.leaderboardBoardKey,
    seasonKey: config.seasonKey,
    score: Math.max(score, 0),
    displayName: user?.username ?? null,
  });
}

export async function startTowerRun(input: { userId: string; minionIds: string[] }) {
  const config = await loadTowerConfig();
  const ids = [...new Set(input.minionIds)];
  if (ids.length < 1 || ids.length > 3) throw new Error("INVALID_PARTY_SIZE");

  return prisma.$transaction(async (tx) => {
    await tx.towerRun.updateMany({
      where: { userId: input.userId, status: "RUNNING" },
      data: { status: "STOPPED" },
    });
    const minions = await tx.minion.findMany({ where: { id: { in: ids }, userId: input.userId } });
    if (minions.length !== ids.length) throw new Error("MINION_NOT_FOUND");

    const run = await tx.towerRun.create({
      data: {
        userId: input.userId,
        seasonKey: config.seasonKey,
        status: "RUNNING",
        floor: 1,
        party: { create: ids.map((minionId) => ({ minionId })) },
      },
      include: { party: { include: { minion: true } } },
    });

    const { combatants } = await loadTowerPartyCombat(tx, input.userId, run);
    await tx.towerRun.update({
      where: { id: run.id },
      data: { partyHpJson: serializePartyHp(snapshotsToEntries(buildFullPartyHp(combatants))) },
    });
    return { ok: true as const, runId: run.id };
  });
}

export async function advanceTowerFloor(input: { userId: string }) {
  const config = await loadTowerConfig();

  return prisma.$transaction(async (tx) => {
    const run = await tx.towerRun.findFirst({
      where: { userId: input.userId, status: "RUNNING", seasonKey: config.seasonKey },
      include: { party: { include: { minion: true } } },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new Error("TOWER_RUN_NOT_FOUND");

    const floor = Math.max(1, run.floor);
    const enc = towerMonsterForFloor(config, floor);
    const monster = await getMonster(enc.monsterId);
    const enemy: FloorEnemy = { name: monster.name, monster };

    const { combatants, memberInputs } = await loadTowerPartyCombat(tx, input.userId, run);
    const entries = parsePartyHpJson(run.partyHpJson);
    const partyHpStart = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));

    const combatReplay = buildCombatReplay(
      floor,
      enemy,
      enc.monsterId,
      partyHpStart,
      combatants,
      memberInputs,
    );
    const clearChance = estimateFloorWinChance({
      floor,
      maxFloors: 9999,
      party: combatants,
      enemy,
      partyHp: partyHpStart,
      samples: 32,
    });

    const battle = simulateFloorCombat({
      floor,
      maxFloors: 9999,
      party: combatants,
      enemy,
      partyHp: partyHpStart,
    });

    const combatLog: CombatLogLine[] = battle.log;

    const partyHpAfter = snapshotsToEntries(battle.partyHp);
    const pending = safeParsePendingLoot(run.pendingLootJson);

    if (battle.outcome !== "WIN") {
      const reached = floor;
      await recordTowerBest(input.userId, config, reached);
      await tx.towerRun.update({
        where: { id: run.id },
        data: {
          status: "STOPPED",
          bestFloor: Math.max(run.bestFloor, reached - 1),
          losses: { increment: 1 },
          partyHpJson: serializePartyHp(partyHpAfter),
          pendingLootJson: "[]",
          lastTickAt: new Date(),
        },
      });
      const forfeited = await enrichLootEntries(tx, pending);
      return {
        ok: true as const,
        result: "LOSS" as const,
        floor,
        clearChance,
        combatLog,
        combatReplay,
        isBoss: enc.category === "Boss",
        forfeitedLoot: forfeited,
      };
    }

    const mult = pushLuckLootMultiplier(floor);
    const gained = scaleLootEntries(rollTowerDrops(config, 1), mult);
    const nextPending = mergeLoot(pending, gained);
    const nextFloor = floor + 1;
    const bestFloor = Math.max(run.bestFloor, floor);

    await grantMinionsExperience(tx, run.party.map((p) => p.minionId), 10 + floor * 2);
    await tx.towerRun.update({
      where: { id: run.id },
      data: {
        wins: { increment: 1 },
        floor: nextFloor,
        bestFloor,
        pendingLootJson: JSON.stringify(nextPending),
        partyHpJson: serializePartyHp(partyHpAfter),
        lastTickAt: new Date(),
      },
    });

    return {
      ok: true as const,
      result: "WIN" as const,
      floor,
      clearChance,
      combatLog,
      combatReplay,
      isBoss: enc.category === "Boss",
      lootGained: await enrichLootEntries(tx, gained),
      pendingLoot: await enrichLootEntries(tx, nextPending),
      lootMultiplier: mult,
    };
  });
}

export async function cashoutTowerRun(input: { userId: string }) {
  const config = await loadTowerConfig();
  const run = await prisma.towerRun.findFirst({
    where: { userId: input.userId, status: "RUNNING", seasonKey: config.seasonKey },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_TOWER");

  const pending = safeParsePendingLoot(run.pendingLootJson);
  const cashedOut = await enrichLootEntries(prisma, pending);

  await grantLootToUser(prisma, input.userId, pending);

  const reached = Math.max(run.bestFloor, run.floor - 1);
  await recordTowerBest(input.userId, config, run.floor);

  await prisma.towerRun.update({
    where: { id: run.id },
    data: { status: "STOPPED", pendingLootJson: "[]", bestFloor: Math.max(run.bestFloor, reached) },
  });

  const rank = await getUserLeaderboardRank({
    userId: input.userId,
    boardKey: config.leaderboardBoardKey,
    seasonKey: config.seasonKey,
  });

  return { ok: true as const, cashedOut, bestFloor: reached, rank };
}

export async function getTowerRunState(userId: string) {
  const config = await loadTowerConfig();
  const run = await prisma.towerRun.findFirst({
    where: { userId, status: "RUNNING", seasonKey: config.seasonKey },
    orderBy: { startedAt: "desc" },
  });
  const rank = await getUserLeaderboardRank({
    userId,
    boardKey: config.leaderboardBoardKey,
    seasonKey: config.seasonKey,
  });
  const leaderboard = await listLeaderboard({
    boardKey: config.leaderboardBoardKey,
    seasonKey: config.seasonKey,
    limit: 10,
  });

  if (!run) {
    return { ok: true as const, active: false as const, config, rank, leaderboard };
  }

  const combatPreview = await getTowerCombatPreview(userId);

  return {
    ok: true as const,
    active: true as const,
    config,
    rank,
    leaderboard,
    combat: combatPreview
      ? { clearChance: combatPreview.clearChance, isBoss: combatPreview.isBoss }
      : undefined,
    run: {
      id: run.id,
      floor: run.floor,
      bestFloor: run.bestFloor,
      pendingLoot: await enrichLootEntries(prisma, safeParsePendingLoot(run.pendingLootJson)),
    },
  };
}
