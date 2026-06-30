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
  _xpAmount: number,
): Promise<MinionXpGrantResult | null> {
  const row = await db.minion.findUnique({
    where: { id: minionId },
    select: { id: true, level: true, experience: true, unspentStatPoints: true },
  });
  if (!row) return null;
  return {
    minionId: row.id,
    xpGained: 0,
    levelsGained: 0,
    statPointsGained: 0,
    level: row.level ?? 1,
    experience: row.experience ?? 0,
    unspentStatPoints: row.unspentStatPoints ?? 0,
  };
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
  _db: Db,
  _minionIds: string[],
  _xpPerMinion: number,
): Promise<MinionXpGrantResult[]> {
  return [];
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
  _db: Db,
  _userId: string,
  _minionId: string,
  _allocation: MinionStatAllocation,
): Promise<MinionStatAllocateResult> {
  throw new Error("MINION_STAT_ALLOC_DISABLED");
}

export async function resetMinionStats(
  _db: Db,
  _userId: string,
  _minionId: string,
): Promise<MinionStatAllocateResult> {
  throw new Error("MINION_STAT_ALLOC_DISABLED");
}
