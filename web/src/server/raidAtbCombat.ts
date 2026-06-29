import { prisma, assertRowsUpdated } from "@/server/db";
import {
  buildPartyCombatants,
  partyMemberToCombatantInput,
  type FloorEnemy,
} from "@/server/dungeonBattler";
import {
  atbSnapshot,
  initAtbCombat,
  parseAtbState,
  partyHpFromAtbState,
  serializeAtbState,
  stepAtbCombat,
} from "@/server/atbCombatEngine";
import { loadPartyCombatRows } from "@/server/minionCombatBuild";
import { knightOrderPartyDamageMult } from "@/shared/knightOrder";
import { getMonster } from "@/server/monsterData";
import { combatPowerFromMonster } from "@/server/monsterCombat";
import { loadRaids, raidEncounterForPhase } from "@/server/raidData";
import { raidBossCombatDisplayName } from "@/shared/raidBossDisplay";
import { contentTierForRaidId } from "@/shared/raidRoster";
import { raidClearGoldReward } from "@/shared/raidFaction";
import { raidModeStatMult } from "@/shared/raidRoster";
import { raidEnemyStatMult } from "@/shared/combatBalance";
import { safeParsePendingLoot, enrichLootEntries, snapshotsToEntries } from "@/server/dungeonRun";
import { scaleLootEntries } from "@/shared/dungeonPushLuck";
import { raidPartyLootMultiplier } from "@/shared/raidPartyLoot";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import { incrementLeaderboardScore } from "@/server/leaderboard";
import { RAID_TOTAL_BOARD_KEY } from "@/server/leaderboardBoards";
import { assignRaidRows, ATB_CLIENT_TICK_MS } from "@/shared/atbCombat";
import type { AtbCombatSnapshot } from "@/shared/atbCombat";
import { buildCombatReportFromAtbEvents } from "@/shared/combatReport";
import type { CombatReport } from "@/shared/combatReport";

type LootEntry = { itemId: string; qty: number };

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollDrops(
  drops: { itemId: string; weight: number; minQty: number; maxQty: number }[],
  rolls: number,
): LootEntry[] {
  const map = new Map<string, number>();
  if (!drops.length || rolls <= 0) return [];
  const weights = drops.map((d) => d.weight);
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
    const e = drops[idx]!;
    const qty = randInt(e.minQty, e.maxQty);
    map.set(e.itemId, (map.get(e.itemId) ?? 0) + qty);
  }
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

function mergeLoot(a: LootEntry[], b: LootEntry[]) {
  const m = new Map<string, number>();
  for (const x of [...a, ...b]) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.qty);
  return [...m.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

async function grantRaidClearGold(userId: string, raidId: string, isBoss: boolean, lootMult: number) {
  const amount = Math.floor(raidClearGoldReward(contentTierForRaidId(raidId), isBoss) * lootMult);
  if (amount <= 0) return 0;
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, goldAvailable: amount },
    update: { goldAvailable: { increment: amount } },
  });
  return amount;
}

async function loadRaidRun(userId: string, raidId: string) {
  const run = await prisma.raidRun.findFirst({
    where: { userId, raidId, status: "RUNNING" },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("RAID_RUN_NOT_FOUND");
  return run;
}

async function resolveRaidPhaseAfterBattle(input: {
  userId: string;
  runId: string;
  phase: number;
  outcome: "WIN" | "LOSS";
  partyHpJson: string;
}) {
  const { raids } = await loadRaids();
  const run = await prisma.raidRun.findUnique({
    where: { id: input.runId },
    include: { party: true },
  });
  if (!run) throw new Error("RAID_RUN_NOT_FOUND");
  const raid = raids.find((r) => r.id === run.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");

  const phase = input.phase;
  const enc = raidEncounterForPhase(raid, phase);
  const pending = safeParsePendingLoot(run.pendingLootJson);
  const partySize = run.party.length;
  const lootMult = raidPartyLootMultiplier(partySize, raid.maxPartySize ?? 3);
  const isBoss = String(enc.category).toUpperCase() === "BOSS";

  if (input.outcome !== "WIN") {
    assertRowsUpdated(
      (
        await prisma.raidRun.updateMany({
          where: { id: run.id, status: "RUNNING", phase },
          data: {
            status: "FAILED",
            losses: { increment: 1 },
            partyHpJson: input.partyHpJson,
            pendingLootJson: "[]",
            combatStateJson: "",
            lastTickAt: new Date(),
          },
        })
      ).count,
    );
    const forfeited = await enrichLootEntries(prisma, pending);
    return {
      ok: true as const,
      result: "LOSS" as const,
      phase,
      isBoss,
      forfeitedLoot: forfeited,
      lootMultiplier: lootMult,
      partySize,
    };
  }

  const phaseLoot = scaleLootEntries(rollDrops(raid.phaseDrops ?? [], 1), lootMult);
  const nextPending = mergeLoot(pending, phaseLoot);
  const cleared = phase >= raid.maxPhases;

  if (cleared) {
    const finalLoot = mergeLoot(nextPending, scaleLootEntries(rollDrops(raid.drops, 2), lootMult));
    assertRowsUpdated(
      (
        await prisma.raidRun.updateMany({
          where: { id: run.id, status: "RUNNING", phase },
          data: {
            status: "CLEARED",
            wins: { increment: 1 },
            phase: phase + 1,
            pendingLootJson: "[]",
            partyHpJson: input.partyHpJson,
            combatStateJson: "",
            lastTickAt: new Date(),
          },
        })
      ).count,
    );
    await grantLootToUser(prisma, input.userId, finalLoot);
    const goldGained = await grantRaidClearGold(input.userId, raid.id, isBoss, lootMult);
    await grantMinionsExperience(prisma, run.party.map((p) => p.minionId), 50 * raid.maxPhases);
    await Promise.all([
      incrementLeaderboardScore({ userId: input.userId, boardKey: `raid:${raid.id}`, seasonKey: "default" }),
      incrementLeaderboardScore({ userId: input.userId, boardKey: RAID_TOTAL_BOARD_KEY, seasonKey: "default" }),
    ]);
    return {
      ok: true as const,
      result: "CLEARED" as const,
      phase,
      isBoss,
      loot: await enrichLootEntries(prisma, finalLoot),
      goldGained,
      lootMultiplier: lootMult,
      partySize,
    };
  }

  assertRowsUpdated(
    (
      await prisma.raidRun.updateMany({
        where: { id: run.id, status: "RUNNING", phase },
        data: {
          wins: { increment: 1 },
          phase: phase + 1,
          pendingLootJson: JSON.stringify(nextPending),
          partyHpJson: input.partyHpJson,
          combatStateJson: "",
          lastTickAt: new Date(),
        },
      })
    ).count,
  );

  return {
    ok: true as const,
    result: "WIN" as const,
    phase,
    isBoss,
    lootGained: await enrichLootEntries(prisma, phaseLoot),
    pendingLoot: await enrichLootEntries(prisma, nextPending),
    lootMultiplier: lootMult,
    partySize,
  };
}

export async function startRaidAtbCombat(input: { userId: string; raidId: string }) {
  const run = await loadRaidRun(input.userId, input.raidId);
  const existing = parseAtbState(run.combatStateJson);
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === input.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");

  if (existing && !existing.outcome) {
    const phase = Math.max(1, existing.phase || run.phase);
    const enc = raidEncounterForPhase(raid, phase);
    const isBossResume = String(enc.category).toUpperCase() === "BOSS";
    return {
      ok: true as const,
      snapshot: atbSnapshot(existing, []),
      tickMs: ATB_CLIENT_TICK_MS,
      isBoss: isBossResume,
    };
  }

  const phase = Math.max(1, run.phase);
  const enc = raidEncounterForPhase(raid, phase);
  const monster = await getMonster(enc.monsterId);
  const isBoss = String(enc.category).toUpperCase() === "BOSS";
  const enemy: FloorEnemy = {
    name: raidBossCombatDisplayName(monster.name, raid.difficulty, isBoss),
    monster,
  };

  const { memberInputs, knightOrder } = await loadPartyCombatRows(prisma, input.userId, run.party);
  const combatants = buildPartyCombatants(memberInputs.map(partyMemberToCombatantInput));
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHpStart = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));

  const rowByMinionId = assignRaidRows(
    memberInputs.map((m) => ({ minionId: m.minionId, endurance: m.endurance ?? 0 })),
  );
  const agilityByMinionId = new Map(memberInputs.map((m) => [m.minionId, m.agility ?? 0]));

  const state = initAtbCombat({
    party: combatants,
    partyHp: partyHpStart,
    rowByMinionId,
    agilityByMinionId,
    enemy,
    enemyStatMult:
      raidEnemyStatMult(isBoss, combatPowerFromMonster(monster)) * raidModeStatMult(raid.difficulty),
    partyDamageMult: knightOrderPartyDamageMult(knightOrder, isBoss),
    enemyTags: { isBoss, isAngel: false, isDemon: false },
    phase,
    monsterId: enc.monsterId,
  });

  await prisma.raidRun.update({
    where: { id: run.id },
    data: { combatStateJson: serializeAtbState(state), lastTickAt: new Date() },
  });

  return {
    ok: true as const,
    snapshot: atbSnapshot(state, []),
    tickMs: ATB_CLIENT_TICK_MS,
    isBoss,
  };
}

export async function tickRaidAtbCombat(input: { userId: string; raidId: string; dtMs?: number }) {
  const run = await loadRaidRun(input.userId, input.raidId);
  const state = parseAtbState(run.combatStateJson);
  if (!state) throw new Error("RAID_COMBAT_NOT_STARTED");

  const { state: next, events, done } = stepAtbCombat(state, input.dtMs ?? ATB_CLIENT_TICK_MS);
  const snapshot: AtbCombatSnapshot = atbSnapshot(next, events);

  if (done && next.outcome) {
    await prisma.raidRun.update({
      where: { id: run.id },
      data: { combatStateJson: serializeAtbState(next), lastTickAt: new Date() },
    });
    const partyHpAfter = serializePartyHp(snapshotsToEntries(partyHpFromAtbState(next)));
    const combatReport = buildCombatReportFromAtbEvents({
      events: next.eventLog,
      fighters: next.fighters.map((f) => ({ id: f.id, label: f.label, side: f.side })),
      durationMs: next.elapsedMs,
      outcome: next.outcome,
    });
    const resolved = await resolveRaidPhaseAfterBattle({
      userId: input.userId,
      runId: run.id,
      phase: next.phase,
      outcome: next.outcome,
      partyHpJson: partyHpAfter,
    });
    return {
      ...resolved,
      snapshot,
      done: true,
      tickMs: ATB_CLIENT_TICK_MS,
      ok: true as const,
      combatReport,
    };
  }

  await prisma.raidRun.update({
    where: { id: run.id },
    data: { combatStateJson: serializeAtbState(next), lastTickAt: new Date() },
  });

  return {
    ok: true as const,
    snapshot,
    done: false,
    tickMs: ATB_CLIENT_TICK_MS,
  };
}

export function raidCombatActive(combatStateJson: string | null | undefined): boolean {
  const s = parseAtbState(combatStateJson);
  return !!s && !s.outcome;
}
