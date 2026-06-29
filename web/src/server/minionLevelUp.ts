import type { Prisma, PrismaClient } from "@prisma/client";
import type { MinionStatKey } from "@/shared/minionBaseStats";
import { MINION_STAT_KEYS } from "@/shared/minionBaseStats";
import {
  MINION_LEVEL_RULES,
  isMinionMaxLevel,
  minionXpGrantMultiplier,
  totalEarnedStatPoints,
  type MinionStatAllocation,
  sumStatAllocation,
  xpRequiredForNextLevel,
} from "@/shared/minionLevel";
import { MINION_SKILL_RULES } from "@/shared/minionSkills";
import {
  dungeonAutoWaveXpForStage,
  dungeonFloorXpForStage,
} from "@/shared/dungeonStageProgression";

type Db =
  | Pick<PrismaClient, "minion" | "$transaction">
  | Prisma.TransactionClient;

type MinionXpRow = {
  id: string;
  level: number;
  experience: number;
  unspentStatPoints: number;
  unspentSkillPoints: number;
};

export type MinionXpGrantResult = {
  minionId: string;
  xpGained: number;
  levelsGained: number;
  statPointsGained: number;
  level: number;
  experience: number;
  unspentStatPoints: number;
};

function applyXpToRow(row: {
  id: string;
  level: number;
  experience: number;
  unspentStatPoints: number;
}, xpAmount: number): MinionXpGrantResult {
  let level = Math.max(1, Math.floor(row.level));
  let experience = Math.max(0, Math.floor(row.experience));
  let unspentStatPoints = Math.max(0, Math.floor(row.unspentStatPoints));
  const xpGained = Math.max(0, Math.floor(xpAmount));
  let levelsGained = 0;
  let statPointsGained = 0;

  if (xpGained <= 0 || isMinionMaxLevel(level)) {
    return {
      minionId: row.id,
      xpGained: 0,
      levelsGained: 0,
      statPointsGained: 0,
      level,
      experience,
      unspentStatPoints,
    };
  }

  experience += xpGained;

  while (!isMinionMaxLevel(level)) {
    const need = xpRequiredForNextLevel(level);
    if (experience < need) break;
    experience -= need;
    level += 1;
    levelsGained += 1;
    const pts = MINION_LEVEL_RULES.statPointsPerLevel;
    unspentStatPoints += pts;
    statPointsGained += pts;
  }

  if (isMinionMaxLevel(level)) {
    experience = 0;
  }

  return {
    minionId: row.id,
    xpGained,
    levelsGained,
    statPointsGained,
    level,
    experience,
    unspentStatPoints,
  };
}

export async function grantMinionExperience(
  db: Db,
  minionId: string,
  xpAmount: number,
): Promise<MinionXpGrantResult | null> {
  const row = await db.minion.findUnique({
    where: { id: minionId },
    select: { id: true, level: true, experience: true, unspentStatPoints: true },
  });
  if (!row) return null;

  const mult = minionXpGrantMultiplier(row.level);
  const adjustedXp = Math.max(0, Math.floor(xpAmount * mult));
  const next = applyXpToRow(row, adjustedXp);
  if (next.xpGained <= 0) return next;

  await db.minion.update({
    where: { id: minionId },
    data: {
      level: next.level,
      experience: next.experience,
      unspentStatPoints: next.unspentStatPoints,
    },
  });

  if (next.levelsGained > 0) {
    await db.minion.update({
      where: { id: minionId },
      data: {
        unspentSkillPoints: {
          increment: next.levelsGained * MINION_SKILL_RULES.pointsPerLevel,
        },
      },
    });
  }

  return next;
}

async function persistMinionXpPlans(
  db: Pick<PrismaClient, "minion">,
  rows: MinionXpRow[],
  plans: Array<{ row: MinionXpRow; next: MinionXpGrantResult }>,
) {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const { next } of plans) {
    if (next.xpGained <= 0) continue;
    const row = rowById.get(next.minionId);
    if (!row) continue;
    const skillPointAdd =
      next.levelsGained > 0 ? next.levelsGained * MINION_SKILL_RULES.pointsPerLevel : 0;
    await db.minion.update({
      where: { id: next.minionId },
      data: {
        level: next.level,
        experience: next.experience,
        unspentStatPoints: next.unspentStatPoints,
        ...(skillPointAdd > 0
          ? {
              unspentSkillPoints:
                Math.max(0, Math.floor(row.unspentSkillPoints ?? 0)) + skillPointAdd,
            }
          : {}),
      },
    });
  }
}

export async function grantMinionsExperience(
  db: Db,
  minionIds: string[],
  xpPerMinion: number,
): Promise<MinionXpGrantResult[]> {
  const xp = Math.max(0, Math.floor(xpPerMinion));
  if (xp <= 0 || minionIds.length === 0) return [];

  const uniqueIds = [...new Set(minionIds)];
  const rows = await db.minion.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      level: true,
      experience: true,
      unspentStatPoints: true,
      unspentSkillPoints: true,
    },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const plans = minionIds
    .map((minionId) => {
      const row = rowById.get(minionId);
      if (!row) return null;
      const mult = minionXpGrantMultiplier(row.level);
      const adjustedXp = Math.max(0, Math.floor(xp * mult));
      return { row, next: applyXpToRow(row, adjustedXp) };
    })
    .filter((plan): plan is { row: MinionXpRow; next: MinionXpGrantResult } => plan != null);

  const writes = plans.filter(({ next }) => next.xpGained > 0);
  if (writes.length > 0) {
    if ("$transaction" in db && typeof db.$transaction === "function") {
      await db.$transaction(async (tx) => persistMinionXpPlans(tx, rows, writes));
    } else {
      await persistMinionXpPlans(db, rows, writes);
    }
  }

  return plans.map(({ next }) => next);
}

export async function grantDungeonFloorXp(
  db: Db,
  minionIds: string[],
  dungeonId: string,
  floor: number,
): Promise<MinionXpGrantResult[]> {
  const xp = dungeonFloorXpForStage(dungeonId, floor);
  return grantMinionsExperience(db, minionIds, xp);
}

export async function grantDungeonAutoWaveXp(
  db: Db,
  minionIds: string[],
  dungeonId: string,
  maxFloors: number,
): Promise<MinionXpGrantResult[]> {
  const xp = dungeonAutoWaveXpForStage(dungeonId, maxFloors);
  return grantMinionsExperience(db, minionIds, xp);
}

export type MinionStatAllocateResult = {
  minionId: string;
  baseStats: Record<MinionStatKey, number>;
  unspentStatPoints: number;
  combatClassLabel?: string;
};

export async function allocateMinionStats(
  db: Db,
  userId: string,
  minionId: string,
  allocation: MinionStatAllocation,
): Promise<MinionStatAllocateResult> {
  const spend = sumStatAllocation(allocation);
  if (spend <= 0) throw new Error("NO_STAT_POINTS_TO_ALLOCATE");

  for (const key of MINION_STAT_KEYS) {
    const v = allocation[key];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) throw new Error("INVALID_STAT_ALLOCATION");
  }

  const row = await db.minion.findUnique({ where: { id: minionId } });
  if (!row) throw new Error("MINION_NOT_FOUND");
  if (row.userId !== userId) throw new Error("FORBIDDEN");
  const unspent = Math.max(0, Math.floor(row.unspentStatPoints));
  if (spend > unspent) throw new Error("INSUFFICIENT_STAT_POINTS");

  const nextStats: Record<MinionStatKey, number> = {
    strength: row.strength,
    agility: row.agility,
    intelligence: row.intelligence,
    endurance: row.endurance,
  };

  for (const key of MINION_STAT_KEYS) {
    const add = Math.floor(allocation[key] ?? 0);
    if (add <= 0) continue;
    const cap = MINION_LEVEL_RULES.maxStatPerAttribute;
    const cur = nextStats[key];
    if (cur + add > cap) throw new Error(`STAT_CAP_EXCEEDED:${key}`);
    nextStats[key] = cur + add;
  }

  const updated = await db.minion.update({
    where: { id: minionId },
    data: {
      strength: nextStats.strength,
      agility: nextStats.agility,
      intelligence: nextStats.intelligence,
      endurance: nextStats.endurance,
      unspentStatPoints: unspent - spend,
    },
    select: {
      id: true,
      strength: true,
      agility: true,
      intelligence: true,
      endurance: true,
      unspentStatPoints: true,
    },
  });

  return {
    minionId: updated.id,
    baseStats: {
      strength: updated.strength,
      agility: updated.agility,
      intelligence: updated.intelligence,
      endurance: updated.endurance,
    },
    unspentStatPoints: updated.unspentStatPoints,
  };
}

export async function resetMinionStats(
  db: Db,
  userId: string,
  minionId: string,
): Promise<MinionStatAllocateResult> {
  const row = await db.minion.findUnique({ where: { id: minionId } });
  if (!row) throw new Error("MINION_NOT_FOUND");
  if (row.userId !== userId) throw new Error("FORBIDDEN");

  const spent =
    Math.max(0, row.strength) +
    Math.max(0, row.agility) +
    Math.max(0, row.intelligence) +
    Math.max(0, row.endurance);
  if (spent <= 0) throw new Error("NOTHING_TO_RESET");

  const unspentStatPoints = totalEarnedStatPoints(row.level ?? 1);
  const updated = await db.minion.update({
    where: { id: minionId },
    data: {
      strength: 0,
      agility: 0,
      intelligence: 0,
      endurance: 0,
      unspentStatPoints,
    },
    select: {
      id: true,
      strength: true,
      agility: true,
      intelligence: true,
      endurance: true,
      unspentStatPoints: true,
    },
  });

  return {
    minionId: updated.id,
    baseStats: {
      strength: updated.strength,
      agility: updated.agility,
      intelligence: updated.intelligence,
      endurance: updated.endurance,
    },
    unspentStatPoints: updated.unspentStatPoints,
  };
}
