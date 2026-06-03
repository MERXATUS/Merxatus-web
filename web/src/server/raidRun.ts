import { prisma } from "@/server/db";
import { buildPartyCombatants, buildFullPartyHp, estimateFloorWinChance, simulateFloorCombat, type FloorEnemy } from "@/server/dungeonBattler";
import { buildCombatReplay } from "@/server/combatReplay";
import { loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { getMonster } from "@/server/monsterData";
import { loadRaids, raidEncounterForPhase, type RaidDef } from "@/server/raidData";
import { safeParsePendingLoot, enrichLootEntries, snapshotsToEntries } from "@/server/dungeonRun";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

type LootEntry = { itemId: string; qty: number };

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollDrops(drops: RaidDef["drops"], rolls: number): LootEntry[] {
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

async function loadRaidPartyCombat(db: PartyCombatDb, userId: string, run: { party: Array<{ minionId: string; minion: { level: number; jobType: string; equippedWeaponInstanceId: string | null } }> }) {
  const { memberInputs } = await loadPartyCombatRows(db, userId, run.party);
  const combatants = buildPartyCombatants(
    memberInputs.map((x) => ({
      minionId: x.minionId,
      combatClassLabel: x.combatClassLabel,
      power: x.power,
      bonusHp: x.bonusHp,
      bonusDef: x.bonusDef,
    })),
  );
  return { combatants, memberInputs };
}

async function applyLootToUser(
  tx: PartyCombatDb & Pick<import("@prisma/client").PrismaClient, "item" | "inventoryStack" | "weaponInstance">,
  userId: string,
  loot: LootEntry[],
) {
  await grantLootToUser(tx, userId, loot);
}

export async function startRaidRun(input: { userId: string; raidId: string; minionIds: string[] }) {
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === input.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");
  const ids = [...new Set(input.minionIds)];
  if (ids.length < 1 || ids.length > (raid.maxPartySize ?? 3)) throw new Error("INVALID_PARTY_SIZE");

  return prisma.$transaction(async (tx) => {
    await tx.raidRun.updateMany({
      where: { userId: input.userId, status: "RUNNING" },
      data: { status: "STOPPED" },
    });
    const minions = await tx.minion.findMany({ where: { id: { in: ids }, userId: input.userId } });
    if (minions.length !== ids.length) throw new Error("MINION_NOT_FOUND");

    const run = await tx.raidRun.create({
      data: {
        userId: input.userId,
        raidId: raid.id,
        status: "RUNNING",
        phase: 1,
        party: { create: ids.map((minionId) => ({ minionId })) },
      },
      include: { party: { include: { minion: true } } },
    });

    const { combatants } = await loadRaidPartyCombat(tx, input.userId, run);
    await tx.raidRun.update({
      where: { id: run.id },
      data: { partyHpJson: serializePartyHp(snapshotsToEntries(buildFullPartyHp(combatants))) },
    });
    return { ok: true as const, runId: run.id };
  });
}

export async function advanceRaidPhase(input: { userId: string; raidId: string }) {
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === input.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const run = await tx.raidRun.findFirst({
      where: { userId: input.userId, raidId: input.raidId, status: "RUNNING" },
      include: { party: { include: { minion: true } } },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new Error("RAID_RUN_NOT_FOUND");

    const phase = Math.max(1, run.phase);
    const enc = raidEncounterForPhase(raid, phase);
    const monster = await getMonster(enc.monsterId);
    const enemy: FloorEnemy = { name: monster.name, monster };

    const { combatants, memberInputs } = await loadRaidPartyCombat(tx, input.userId, run);
    const entries = parsePartyHpJson(run.partyHpJson);
    const partyHpStart = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));

    const combatReplay = buildCombatReplay(
      phase,
      enemy,
      enc.monsterId,
      partyHpStart,
      combatants,
      memberInputs,
    );
    const clearChance = estimateFloorWinChance({
      floor: phase,
      maxFloors: raid.maxPhases,
      party: combatants,
      enemy,
      partyHp: partyHpStart,
      samples: 32,
    });

    const battle = simulateFloorCombat({
      floor: phase,
      maxFloors: raid.maxPhases,
      party: combatants,
      enemy,
      partyHp: partyHpStart,
    });

    const combatLog: CombatLogLine[] = battle.log;

    const partyHpAfter = snapshotsToEntries(battle.partyHp);
    const pending = safeParsePendingLoot(run.pendingLootJson);

    if (battle.outcome !== "WIN") {
      await tx.raidRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
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
        phase,
        clearChance,
        combatLog,
        combatReplay,
        isBoss: enc.category === "Boss",
        forfeitedLoot: forfeited,
      };
    }

    const phaseLoot = rollDrops(raid.phaseDrops ?? [], 1);
    const nextPending = mergeLoot(pending, phaseLoot);
    const cleared = phase >= raid.maxPhases;

    if (cleared) {
      const finalLoot = mergeLoot(nextPending, rollDrops(raid.drops, 2));
      await applyLootToUser(tx, input.userId, finalLoot);
      await grantMinionsExperience(tx, run.party.map((p) => p.minionId), 50 * raid.maxPhases);
      await tx.raidRun.update({
        where: { id: run.id },
        data: {
          status: "CLEARED",
          wins: { increment: 1 },
          phase: phase + 1,
          pendingLootJson: "[]",
          partyHpJson: serializePartyHp(partyHpAfter),
          lastTickAt: new Date(),
        },
      });
      return {
        ok: true as const,
        result: "CLEARED" as const,
        phase,
        clearChance,
        combatLog,
        combatReplay,
        isBoss: enc.category === "Boss",
        loot: await enrichLootEntries(tx, finalLoot),
      };
    }

    await tx.raidRun.update({
      where: { id: run.id },
      data: {
        wins: { increment: 1 },
        phase: phase + 1,
        pendingLootJson: JSON.stringify(nextPending),
        partyHpJson: serializePartyHp(partyHpAfter),
        lastTickAt: new Date(),
      },
    });

    return {
      ok: true as const,
      result: "WIN" as const,
      phase,
      clearChance,
      combatLog,
      combatReplay,
      isBoss: enc.category === "Boss",
      lootGained: await enrichLootEntries(tx, phaseLoot),
      pendingLoot: await enrichLootEntries(tx, nextPending),
    };
  });
}

export async function getRaidCombatPreview(userId: string) {
  const run = await prisma.raidRun.findFirst({
    where: { userId, status: "RUNNING" },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === run.raidId);
  if (!raid) return null;
  const phase = Math.max(1, run.phase);
  const enc = raidEncounterForPhase(raid, phase);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };
  const { combatants } = await loadRaidPartyCombat(prisma, userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHp = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const clearChance = estimateFloorWinChance({
    floor: phase,
    maxFloors: raid.maxPhases,
    party: combatants,
    enemy,
    partyHp,
    samples: 32,
  });
  return { clearChance, phase, isBoss: enc.category === "Boss" };
}

export async function getRaidRunState(userId: string) {
  const run = await prisma.raidRun.findFirst({
    where: { userId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    include: { party: { include: { minion: true } } },
  });
  if (!run) return { ok: true as const, active: false as const };
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === run.raidId);
  const combatPreview = await getRaidCombatPreview(userId);
  return {
    ok: true as const,
    active: true as const,
    combat: combatPreview
      ? { clearChance: combatPreview.clearChance, isBoss: combatPreview.isBoss }
      : undefined,
    run: {
      id: run.id,
      raidId: run.raidId,
      raidName: raid?.name ?? run.raidId,
      phase: run.phase,
      maxPhases: raid?.maxPhases ?? 1,
      pendingLoot: await enrichLootEntries(prisma, safeParsePendingLoot(run.pendingLootJson)),
    },
  };
}

export async function stopRaidRun(userId: string) {
  const run = await prisma.raidRun.findFirst({
    where: { userId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_RAID");
  const pending = safeParsePendingLoot(run.pendingLootJson);
  const forfeited = await enrichLootEntries(prisma, pending);
  await prisma.raidRun.update({
    where: { id: run.id },
    data: { status: "STOPPED", pendingLootJson: "[]" },
  });
  return { ok: true as const, forfeitedLoot: forfeited };
}

export async function listRaidsPayload() {
  const { raids } = await loadRaids();
  return { ok: true as const, raids };
}
