import { prisma, assertRowsUpdated } from "@/server/db";
import { loadDungeons, type DungeonDef } from "@/server/dungeonData";
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
import { resolveFloorMonster } from "@/server/dungeonEncounters";
import { loadPartyCombatRows } from "@/server/minionCombatBuild";
import { knightOrderPartyDamageMult } from "@/shared/knightOrder";
import {
  safeParsePendingLoot,
  enrichLootEntries,
  snapshotsToEntries,
  resolvePartyHpForRun,
} from "@/server/dungeonRun";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantDungeonFloorXp } from "@/server/minionLevelUp";
import { grantDungeonRunGold } from "@/server/dungeonGoldEarn";
import { dungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import { stageOrderForDungeonId } from "@/shared/dungeonStageProgression";
import { pushLuckFloorGoldReward, pushLuckLootMultiplier, scaleLootEntries } from "@/shared/dungeonPushLuck";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { assignRaidRows, ATB_CLIENT_TICK_MS } from "@/shared/atbCombat";
import type { AtbCombatSnapshot } from "@/shared/atbCombat";
import { buildCombatReportFromAtbEvents } from "@/shared/combatReport";
import type { CombatReport } from "@/shared/combatReport";
import type { MinionXpGrantPayload } from "@/shared/dungeonSettlement";

type LootEntry = { itemId: string; qty: number };

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollDrops(
  drops: { itemId: string; weight: number; minQty: number; maxQty: number }[],
  rolls: number,
  floor: number,
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
  void floor;
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

function mergeLoot(a: LootEntry[], b: LootEntry[]) {
  const m = new Map<string, number>();
  for (const x of [...a, ...b]) m.set(x.itemId, (m.get(x.itemId) ?? 0) + x.qty);
  return [...m.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

async function loadDungeonRun(userId: string, dungeonId: string) {
  const run = await prisma.dungeonRun.findFirst({
    where: { userId, dungeonId, status: "RUNNING", autoExplore: false },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");
  return run;
}

async function loadRunPartyCombat(userId: string, run: Awaited<ReturnType<typeof loadDungeonRun>>) {
  const { memberInputs, knightOrder } = await loadPartyCombatRows(prisma, userId, run.party);
  const combatants = buildPartyCombatants(memberInputs.map(partyMemberToCombatantInput));
  const partyPower = memberInputs.reduce((s, m) => s + m.power, 0);
  return { memberInputs, knightOrder, combatants, partyPower };
}

async function resolveDungeonFloorAfterBattle(input: {
  userId: string;
  runId: string;
  dungeon: DungeonDef;
  floor: number;
  outcome: "WIN" | "LOSS";
  partyHpJson: string;
  partyPower: number;
  isBoss: boolean;
  atbState: ReturnType<typeof parseAtbState>;
  allEvents: import("@/shared/atbCombat").AtbCombatEvent[];
}) {
  const run = await prisma.dungeonRun.findUnique({
    where: { id: input.runId },
    include: { party: true },
  });
  if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

  const floor = input.floor;
  const pending = safeParsePendingLoot(run.pendingLootJson ?? "[]");
  const maxFloors = input.dungeon.maxFloors ?? 20;
  const stageOrder = stageOrderForDungeonId(input.dungeon.id) ?? 1;
  const partyHpAfter = parsePartyHpJson(input.partyHpJson);

  const combatReport: CombatReport | undefined = input.atbState
    ? buildCombatReportFromAtbEvents({
        events: input.allEvents,
        fighters: input.atbState.fighters.map((f) => ({ id: f.id, label: f.label, side: f.side })),
        durationMs: input.atbState.elapsedMs,
        outcome: input.outcome,
      })
    : undefined;

  if (input.outcome !== "WIN") {
    const forfeitedGold = Math.max(0, Math.floor(run.pendingGold ?? 0));
    assertRowsUpdated(
      await prisma.dungeonRun.updateMany({
        where: { id: run.id, status: "RUNNING", floor },
        data: {
          status: "STOPPED",
          losses: { increment: 1 },
          lastTickAt: new Date(),
          pendingLootJson: "[]",
          pendingGold: 0,
          partyHpJson: input.partyHpJson,
          combatStateJson: "",
        },
      }).then((r) => r.count),
    );
    const forfeitedLoot = await enrichLootEntries(prisma, pending);
    return {
      ok: true as const,
      result: "LOSS" as const,
      floor,
      partyPower: input.partyPower,
      isBoss: input.isBoss,
      partyHp: partyHpAfter,
      forfeitedLoot,
      forfeitedGold,
      pendingGold: 0,
      combatReport,
    };
  }

  const lootMult = pushLuckLootMultiplier(floor);
  const rawLoot = rollDrops(input.dungeon.drops, 1, floor);
  const rawBoss = floor >= maxFloors ? rollDrops(input.dungeon.bossDrops ?? [], 1, floor) : [];
  const gained = scaleLootEntries(mergeLoot(rawLoot, rawBoss), lootMult);
  const nextPending = mergeLoot(pending, gained);
  const nextFloor = Math.min(maxFloors + 1, floor + 1);
  const floorGold = pushLuckFloorGoldReward(floor, stageOrder);
  const nextPendingGold = Math.max(0, Math.floor(run.pendingGold ?? 0)) + floorGold;
  const partyMinionIds = run.party.map((p) => p.minionId);
  const minionXpGrants: MinionXpGrantPayload[] = await grantDungeonFloorXp(
    prisma,
    partyMinionIds,
    input.dungeon.id,
    floor,
  );

  const finished = floor >= maxFloors;
  if (finished) {
    assertRowsUpdated(
      (
        await prisma.dungeonRun.updateMany({
          where: { id: run.id, status: "RUNNING", floor },
          data: {
            wins: { increment: 1 },
            lastTickAt: new Date(),
            floor: nextFloor,
            partyHpJson: input.partyHpJson,
            status: "STOPPED",
            pendingLootJson: "[]",
            pendingGold: 0,
            combatStateJson: "",
          },
        })
      ).count,
    );
    await grantLootToUser(prisma, input.userId, nextPending);
    if (nextPendingGold > 0) {
      await grantDungeonRunGold(prisma, {
        userId: input.userId,
        dungeonId: input.dungeon.id,
        amount: nextPendingGold,
      });
    }
    const cashedOutDisplay = await enrichLootEntries(prisma, nextPending);
    return {
      ok: true as const,
      result: "WIN_AND_CASHOUT" as const,
      floor,
      partyPower: input.partyPower,
      isBoss: input.isBoss,
      partyHp: partyHpAfter,
      cashedOut: cashedOutDisplay,
      goldGained: nextPendingGold,
      lootMultiplier: lootMult,
      minionXpGrants,
      pendingGold: 0,
      combatReport,
    };
  }

  assertRowsUpdated(
    await prisma.dungeonRun.updateMany({
      where: { id: run.id, status: "RUNNING", floor },
      data: {
        wins: { increment: 1 },
        lastTickAt: new Date(),
        floor: nextFloor,
        pendingLootJson: JSON.stringify(nextPending),
        pendingGold: nextPendingGold,
        partyHpJson: input.partyHpJson,
        combatStateJson: "",
      },
    }).then((r) => r.count),
  );

  return {
    ok: true as const,
    result: "WIN" as const,
    floor,
    partyPower: input.partyPower,
    isBoss: input.isBoss,
    partyHp: partyHpAfter,
    lootGained: gained,
    pendingLoot: nextPending,
    goldGained: floorGold,
    pendingGold: nextPendingGold,
    lootMultiplier: lootMult,
    minionXpGrants,
    combatReport,
  };
}

export async function startDungeonAtbCombat(input: { userId: string; dungeonId: string }) {
  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === input.dungeonId);
  if (!dungeon || dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

  const run = await loadDungeonRun(input.userId, input.dungeonId);
  const existing = parseAtbState(run.combatStateJson);
  if (existing && !existing.outcome) {
    return {
      ok: true as const,
      snapshot: atbSnapshot(existing, []),
      tickMs: ATB_CLIENT_TICK_MS,
      isBoss: existing.enemyTags.isBoss,
      floor: run.floor,
    };
  }

  const floor = Math.max(1, run.floor ?? 1);
  const { memberInputs, knightOrder, combatants } = await loadRunPartyCombat(input.userId, run);
  const { map: partyHpStart } = resolvePartyHpForRun(run.partyHpJson, combatants);

  const floorMonster = await resolveFloorMonster(dungeon, floor);
  const enemy: FloorEnemy = { name: floorMonster.monster.name, monster: floorMonster.monster };
  const isBoss = floorMonster.category === "BOSS";
  const maxFloors = dungeon.maxFloors ?? 20;
  const stageOrder = stageOrderForDungeonId(dungeon.id) ?? 1;
  const enemyCombatMults = dungeonEnemyCombatMults({ stageOrder, floor, maxFloors, isBoss });
  const partyDamageMult = knightOrderPartyDamageMult(knightOrder, isBoss);

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
    enemyStatMult: 1,
    enemyCombatMults,
    partyDamageMult,
    enemyTags: { isBoss, isAngel: false, isDemon: false },
    phase: floor,
    monsterId: floorMonster.monsterId,
  });

  await prisma.dungeonRun.update({
    where: { id: run.id },
    data: { combatStateJson: serializeAtbState(state), lastTickAt: new Date() },
  });

  return {
    ok: true as const,
    snapshot: atbSnapshot(state, []),
    tickMs: ATB_CLIENT_TICK_MS,
    isBoss,
    floor,
  };
}

export async function tickDungeonAtbCombat(input: {
  userId: string;
  dungeonId: string;
  dtMs?: number;
}) {
  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === input.dungeonId);
  if (!dungeon) throw new Error("DUNGEON_DEF_MISSING");

  const run = await loadDungeonRun(input.userId, input.dungeonId);
  const state = parseAtbState(run.combatStateJson);
  if (!state) throw new Error("DUNGEON_COMBAT_NOT_STARTED");

  const floor = Math.max(1, run.floor ?? 1);
  const { partyPower } = await loadRunPartyCombat(input.userId, run);
  const isBoss = state.enemyTags.isBoss;

  const { state: next, events, done } = stepAtbCombat(state, input.dtMs ?? ATB_CLIENT_TICK_MS);
  const snapshot: AtbCombatSnapshot = atbSnapshot(next, events);

  if (done && next.outcome) {
    await prisma.dungeonRun.update({
      where: { id: run.id },
      data: { combatStateJson: serializeAtbState(next), lastTickAt: new Date() },
    });
    const partyHpAfter = serializePartyHp(snapshotsToEntries(partyHpFromAtbState(next)));
    const resolved = await resolveDungeonFloorAfterBattle({
      userId: input.userId,
      runId: run.id,
      dungeon,
      floor,
      outcome: next.outcome,
      partyHpJson: partyHpAfter,
      partyPower,
      isBoss,
      atbState: next,
      allEvents: next.eventLog,
    });
    return {
      ...resolved,
      snapshot,
      done: true,
      tickMs: ATB_CLIENT_TICK_MS,
      ok: true as const,
    };
  }

  await prisma.dungeonRun.update({
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

export function dungeonCombatActive(combatStateJson: string | null | undefined): boolean {
  const s = parseAtbState(combatStateJson);
  return !!s && !s.outcome;
}
