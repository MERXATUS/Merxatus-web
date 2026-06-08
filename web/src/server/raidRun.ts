import { prisma, assertRowsUpdated } from "@/server/db";
import { buildPartyCombatants, buildFullPartyHp, estimateFloorWinChance, simulateFloorCombat, type FloorEnemy } from "@/server/dungeonBattler";
import { buildCombatReplay } from "@/server/combatReplay";
import { loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { knightOrderPartyDamageMult } from "@/shared/knightOrder";
import { getMonster } from "@/server/monsterData";
import { loadRaids, raidEncounterForPhase, type RaidDef } from "@/server/raidData";
import { loadMonsters } from "@/server/monsterData";
import { combatPowerFromMonster } from "@/server/monsterCombat";
import { raidDifficultyMeta } from "@/shared/raidDifficulty";
import { safeParsePendingLoot, enrichLootEntries, snapshotsToEntries } from "@/server/dungeonRun";
import { scaleLootEntries } from "@/shared/dungeonPushLuck";
import { raidPartyLootMultiplier } from "@/shared/raidPartyLoot";
import { parsePartyHpJson, serializePartyHp } from "@/shared/dungeonPartyHp";
import { grantLootToUser } from "@/server/grantLootToUser";
import { grantMinionsExperience } from "@/server/minionLevelUp";
import { contentTierForRaidId } from "@/shared/craftingItemDrops";
import { raidClearGoldReward } from "@/shared/raidFaction";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import { inferEnemyCombatTags } from "@/shared/equipmentCombatModifiers";
import { incrementLeaderboardScore } from "@/server/leaderboard";
import { RAID_TOTAL_BOARD_KEY } from "@/server/leaderboardBoards";

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
  const { memberInputs, knightOrder } = await loadPartyCombatRows(db, userId, run.party);
  const combatants = buildPartyCombatants(
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
  );
  return { combatants, memberInputs, knightOrder };
}

async function applyLootToUser(
  tx: PartyCombatDb & Pick<import("@prisma/client").PrismaClient, "item" | "inventoryStack" | "weaponInstance">,
  userId: string,
  loot: LootEntry[],
) {
  await grantLootToUser(tx, userId, loot);
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

export async function startRaidRun(input: { userId: string; raidId: string; minionIds: string[] }) {
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === input.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");
  const ids = [...new Set(input.minionIds)];
  if (ids.length < 1 || ids.length > (raid.maxPartySize ?? 3)) throw new Error("INVALID_PARTY_SIZE");

  await prisma.raidRun.updateMany({
    where: { userId: input.userId, status: "RUNNING" },
    data: { status: "STOPPED" },
  });
  const minions = await prisma.minion.findMany({ where: { id: { in: ids }, userId: input.userId } });
  if (minions.length !== ids.length) throw new Error("MINION_NOT_FOUND");

  const run = await prisma.raidRun.create({
    data: {
      userId: input.userId,
      raidId: raid.id,
      status: "RUNNING",
      phase: 1,
      party: { create: ids.map((minionId) => ({ minionId })) },
    },
    include: { party: { include: { minion: true } } },
  });

  const { combatants } = await loadRaidPartyCombat(prisma, input.userId, run);
  await prisma.raidRun.update({
    where: { id: run.id },
    data: { partyHpJson: serializePartyHp(snapshotsToEntries(buildFullPartyHp(combatants))) },
  });
  return { ok: true as const, runId: run.id };
}

export async function advanceRaidPhase(input: { userId: string; raidId: string }) {
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === input.raidId);
  if (!raid) throw new Error("RAID_NOT_FOUND");

  const run = await prisma.raidRun.findFirst({
    where: { userId: input.userId, raidId: input.raidId, status: "RUNNING" },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("RAID_RUN_NOT_FOUND");

  const phase = Math.max(1, run.phase);
  const enc = raidEncounterForPhase(raid, phase);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };

  const { combatants, memberInputs, knightOrder } = await loadRaidPartyCombat(prisma, input.userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHpStart = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const isBoss = String(enc.category).toUpperCase() === "BOSS";
  const partyDamageMult = knightOrderPartyDamageMult(knightOrder, isBoss);
  const enemyTags = inferEnemyCombatTags({
    category: enc.category,
    monsterId: enc.monsterId,
    monsterName: monster.name,
  });

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
    partyDamageMult,
    enemyTags,
  });

  const battle = simulateFloorCombat({
    floor: phase,
    maxFloors: raid.maxPhases,
    party: combatants,
    enemy,
    partyHp: partyHpStart,
    partyDamageMult,
    enemyTags,
  });

  const combatLog: CombatLogLine[] = battle.log;
  const partyHpAfter = snapshotsToEntries(battle.partyHp);
  const pending = safeParsePendingLoot(run.pendingLootJson);
  const partySize = run.party.length;
  const lootMult = raidPartyLootMultiplier(partySize, raid.maxPartySize ?? 3);

  if (battle.outcome !== "WIN") {
    assertRowsUpdated(
      (
        await prisma.raidRun.updateMany({
          where: { id: run.id, status: "RUNNING", phase },
          data: {
            status: "FAILED",
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
      phase,
      clearChance,
      combatLog,
      combatReplay,
      isBoss: enc.category === "Boss",
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
            partyHpJson: serializePartyHp(partyHpAfter),
            lastTickAt: new Date(),
          },
        })
      ).count,
    );
    await applyLootToUser(prisma, input.userId, finalLoot);
    const goldGained = await grantRaidClearGold(input.userId, raid.id, isBoss, lootMult);
    await grantMinionsExperience(prisma, run.party.map((p) => p.minionId), 50 * raid.maxPhases);
    await Promise.all([
      incrementLeaderboardScore({
        userId: input.userId,
        boardKey: `raid:${raid.id}`,
        seasonKey: "default",
      }),
      incrementLeaderboardScore({
        userId: input.userId,
        boardKey: RAID_TOTAL_BOARD_KEY,
        seasonKey: "default",
      }),
    ]);
    return {
      ok: true as const,
      result: "CLEARED" as const,
      phase,
      clearChance,
      combatLog,
      combatReplay,
      isBoss: enc.category === "Boss",
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
          partyHpJson: serializePartyHp(partyHpAfter),
          lastTickAt: new Date(),
        },
      })
    ).count,
  );

  return {
    ok: true as const,
    result: "WIN" as const,
    phase,
    clearChance,
    combatLog,
    combatReplay,
    isBoss: enc.category === "Boss",
    lootGained: await enrichLootEntries(prisma, phaseLoot),
    pendingLoot: await enrichLootEntries(prisma, nextPending),
    lootMultiplier: lootMult,
    partySize,
  };
}

type RaidRunWithParty = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.raidRun.findFirst<{
        include: { party: { include: { minion: true } } };
      }>
    >
  >
>;

export async function getRaidCombatPreview(userId: string, existingRun?: RaidRunWithParty) {
  const run =
    existingRun ??
    (await prisma.raidRun.findFirst({
      where: { userId, status: "RUNNING" },
      include: { party: { include: { minion: true } } },
      orderBy: { startedAt: "desc" },
    }));
  if (!run) return null;
  const { raids } = await loadRaids();
  const raid = raids.find((r) => r.id === run.raidId);
  if (!raid) return null;
  const phase = Math.max(1, run.phase);
  const enc = raidEncounterForPhase(raid, phase);
  const monster = await getMonster(enc.monsterId);
  const enemy: FloorEnemy = { name: monster.name, monster };
  const { combatants, knightOrder } = await loadRaidPartyCombat(prisma, userId, run);
  const entries = parsePartyHpJson(run.partyHpJson);
  const partyHp = Object.fromEntries(entries.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
  const isBoss = String(enc.category).toUpperCase() === "BOSS";
  const enemyTags = inferEnemyCombatTags({
    category: enc.category,
    monsterId: enc.monsterId,
    monsterName: monster.name,
  });
  const clearChance = estimateFloorWinChance({
    floor: phase,
    maxFloors: raid.maxPhases,
    party: combatants,
    enemy,
    partyHp,
    samples: 32,
    partyDamageMult: knightOrderPartyDamageMult(knightOrder, isBoss),
    enemyTags,
  });
  return { clearChance, phase, isBoss };
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
  const phase = Math.max(1, run.phase);
  const enc = raid ? raidEncounterForPhase(raid, phase) : null;
  const isBoss = enc ? String(enc.category).toUpperCase() === "BOSS" : false;
  return {
    ok: true as const,
    active: true as const,
    combat: { isBoss },
    lootMultiplier: raidPartyLootMultiplier(run.party.length, raid?.maxPartySize ?? 3),
    partySize: run.party.length,
    maxPartySize: raid?.maxPartySize ?? 3,
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
  const monsters = await loadMonsters();
  return {
    ok: true as const,
    raids: raids.map((r) => {
      const enc = raidEncounterForPhase(r, 1);
      const monster = monsters[enc.monsterId.trim().toLowerCase()];
      const isBoss = String(enc?.category ?? "").toUpperCase() === "BOSS";
      const enemyPower = monster ? combatPowerFromMonster(monster) : 0;
      const diff = raidDifficultyMeta(r.id, enemyPower, isBoss, r.maxPartySize ?? 3);
      return {
        id: r.id,
        name: r.name,
        maxPhases: r.maxPhases,
        maxPartySize: r.maxPartySize,
        faction: r.faction ?? "void",
        isBoss,
        enemyPower,
        recommendedPartyPower: diff.recommendedPartyPower,
        recommendedPerMinion: diff.recommendedPerMinion,
        difficultyLabel: diff.label,
        difficultyStars: diff.stars,
      };
    }),
  };
}
