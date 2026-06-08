import { prisma, assertRowsUpdated } from "@/server/db";
import { buildPartyCombatants, buildFullPartyHp, estimateFloorWinChance, simulateFloorCombat, type FloorEnemy } from "@/server/dungeonBattler";
import { buildCombatReplay } from "@/server/combatReplay";
import { loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { knightOrderPartyDamageMult } from "@/shared/knightOrder";
import { getMonster } from "@/server/monsterData";
import { loadTowerConfig, towerMonsterForFloor, type TowerDef } from "@/server/towerData";
import { safeParsePendingLoot, enrichLootEntries, snapshotsToEntries } from "@/server/dungeonRun";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { pushLuckLootMultiplier, scaleLootEntries } from "@/shared/dungeonPushLuck";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import { grantLootToUser } from "@/server/grantLootToUser";
import { getUserLeaderboardRank, listLeaderboard, upsertLeaderboardScore } from "@/server/leaderboard";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import { inferEnemyCombatTags } from "@/shared/equipmentCombatModifiers";

type LootEntry = { itemId: string; qty: number };

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollTowerDrops(config: TowerDef, rolls: number, floor: number): LootEntry[] {
  const map = new Map<string, number>();
  const f = Math.max(1, Math.floor(floor));
  const pool = config.drops.filter((d) => {
    const minF = d.minFloor ?? 1;
    const maxF = d.maxFloor ?? Number.MAX_SAFE_INTEGER;
    return minF <= f && f <= maxF;
  });
  if (!pool.length || rolls <= 0) return [];
  const weights = pool.map((d) => d.weight);
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
    const e = pool[idx]!;
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
  const { memberInputs, knightOrder } = await loadPartyCombatRows(db, userId, run.party);
  return {
    memberInputs,
    knightOrder,
    combatants: buildPartyCombatants(
      memberInputs.map((x) => ({
        minionId: x.minionId,
        combatClassLabel: x.combatClassLabel,
        power: x.power,
        bonusHp: x.bonusHp,
        bonusDef: x.bonusDef,
        skillDamageMult: x.skillDamageMult,
        activeSkillName: x.activeSkillName,
        activeSkillId: x.activeSkillId,
        activeSkillLevel: x.activeSkillLevel,
        combatMods: x.combatMods,
      })),
    ),
  };
}

type TowerRunWithParty = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.towerRun.findFirst<{
        include: { party: { include: { minion: true } } };
      }>
    >
  >
>;

export async function getTowerCombatPreview(
  userId: string,
  existingRun?: TowerRunWithParty,
  opts?: { samples?: number },
) {
  const config = await loadTowerConfig();
  const run =
    existingRun ??
    (await prisma.towerRun.findFirst({
      where: { userId, status: "RUNNING", seasonKey: config.seasonKey },
      include: { party: { include: { minion: true } } },
      orderBy: { startedAt: "desc" },
    }));
  if (!run) return null;

  const floor = Math.max(1, run.floor);
  const enc = towerMonsterForFloor(config, floor);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };
  const { combatants, knightOrder } = await loadTowerPartyCombat(prisma, userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHp = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const isBoss = enc.category === "Boss";
  const enemyTags = inferEnemyCombatTags({
    category: enc.category,
    monsterId: enc.monsterId,
    monsterName: monster.name,
  });
  const clearChance = estimateFloorWinChance({
    floor,
    maxFloors: 9999,
    party: combatants,
    enemy,
    partyHp,
    samples: opts?.samples ?? 32,
    partyDamageMult: knightOrderPartyDamageMult(knightOrder, isBoss),
    enemyTags,
  });
  return { clearChance, floor, isBoss };
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

  await prisma.towerRun.updateMany({
    where: { userId: input.userId, status: "RUNNING" },
    data: { status: "STOPPED" },
  });
  const minions = await prisma.minion.findMany({ where: { id: { in: ids }, userId: input.userId } });
  if (minions.length !== ids.length) throw new Error("MINION_NOT_FOUND");

  const run = await prisma.towerRun.create({
    data: {
      userId: input.userId,
      seasonKey: config.seasonKey,
      status: "RUNNING",
      floor: 1,
      party: { create: ids.map((minionId) => ({ minionId })) },
    },
    include: { party: { include: { minion: true } } },
  });

  const { combatants } = await loadTowerPartyCombat(prisma, input.userId, run);
  await prisma.towerRun.update({
    where: { id: run.id },
    data: { partyHpJson: serializePartyHp(snapshotsToEntries(buildFullPartyHp(combatants))) },
  });
  return { ok: true as const, runId: run.id };
}

export async function advanceTowerFloor(input: { userId: string }) {
  const config = await loadTowerConfig();

  const run = await prisma.towerRun.findFirst({
    where: { userId: input.userId, status: "RUNNING", seasonKey: config.seasonKey },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("TOWER_RUN_NOT_FOUND");

  const floor = Math.max(1, run.floor);
  const enc = towerMonsterForFloor(config, floor);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };

  const { combatants, memberInputs, knightOrder } = await loadTowerPartyCombat(prisma, input.userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHpStart = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const isBoss = enc.category === "Boss";
  const partyDamageMult = knightOrderPartyDamageMult(knightOrder, isBoss);
  const enemyTags = inferEnemyCombatTags({
    category: enc.category,
    monsterId: enc.monsterId,
    monsterName: monster.name,
  });

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
    partyDamageMult,
    enemyTags,
  });

  const battle = simulateFloorCombat({
    floor,
    maxFloors: 9999,
    party: combatants,
    enemy,
    partyHp: partyHpStart,
    partyDamageMult,
    enemyTags,
  });

  const combatLog: CombatLogLine[] = battle.log;
  const partyHpAfter = snapshotsToEntries(battle.partyHp);
  const pending = safeParsePendingLoot(run.pendingLootJson);

  if (battle.outcome !== "WIN") {
    const reached = floor;
    await recordTowerBest(input.userId, config, reached);
    assertRowsUpdated(
      (
        await prisma.towerRun.updateMany({
          where: { id: run.id, status: "RUNNING", floor },
          data: {
            status: "STOPPED",
            bestFloor: Math.max(run.bestFloor, reached - 1),
            losses: { increment: 1 },
            partyHpJson: serializePartyHp(partyHpAfter),
            pendingLootJson: "[]",
            lastTickAt: new Date(),
          },
        })
      ).count,
    );
    const forfeited = await enrichLootEntries(prisma, pending);
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
  const gained = scaleLootEntries(rollTowerDrops(config, 1, floor), mult);
  const nextPending = mergeLoot(pending, gained);
  const nextFloor = floor + 1;
  const bestFloor = Math.max(run.bestFloor, floor);

  await grantMinionsExperience(prisma, run.party.map((p) => p.minionId), 10 + floor * 2);
  assertRowsUpdated(
    (
      await prisma.towerRun.updateMany({
        where: { id: run.id, status: "RUNNING", floor },
        data: {
          wins: { increment: 1 },
          floor: nextFloor,
          bestFloor,
          pendingLootJson: JSON.stringify(nextPending),
          partyHpJson: serializePartyHp(partyHpAfter),
          lastTickAt: new Date(),
        },
      })
    ).count,
  );

  return {
    ok: true as const,
    result: "WIN" as const,
    floor,
    clearChance,
    combatLog,
    combatReplay,
    isBoss: enc.category === "Boss",
    lootGained: await enrichLootEntries(prisma, gained),
    pendingLoot: await enrichLootEntries(prisma, nextPending),
    lootMultiplier: mult,
  };
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

export async function getTowerRunState(userId: string, opts?: { includeLeaderboard?: boolean }) {
  const config = await loadTowerConfig();
  const run = await prisma.towerRun.findFirst({
    where: { userId, status: "RUNNING", seasonKey: config.seasonKey },
    orderBy: { startedAt: "desc" },
    include: { party: { include: { minion: true } } },
  });
  const rank = await getUserLeaderboardRank({
    userId,
    boardKey: config.leaderboardBoardKey,
    seasonKey: config.seasonKey,
  });
  const includeLeaderboard = opts?.includeLeaderboard ?? false;
  const leaderboard = includeLeaderboard
    ? await listLeaderboard({
        boardKey: config.leaderboardBoardKey,
        seasonKey: config.seasonKey,
        limit: 10,
      })
    : undefined;

  if (!run) {
    return { ok: true as const, active: false as const, config, rank, leaderboard };
  }

  const combatPreview = await getTowerCombatPreview(userId, run, { samples: 8 });

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
