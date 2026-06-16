import type { Prisma, PrismaClient } from "@prisma/client";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import {
  defaultSkillLevelsForClass,
  mergeSkillLevelsOnPromotion,
  MINION_SKILL_RULES,
  normalizeSkillLevelsForClass,
  parseMinionSkillLevels,
  serializeMinionSkillLevels,
  skillDefById,
  skillsForCombatClass,
  baselineSkillLevelsForPromotion,
  skillPointsSpentAboveBaseline,
  totalEarnedSkillPoints,
  type MinionSkillLevels,
} from "@/shared/minionSkills";
import {
  resolveMinionCombatClass,
  promotionStateFromRow,
  type MinionPromotionTier,
} from "@/shared/minionPromotion";

type Db = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;

export function skillStateFromMinionRow(row: {
  promotionTier?: number | null;
  promotionClass?: string | null;
  skillLevelsJson?: string | null;
  unspentSkillPoints?: number | null;
}) {
  const combatClass = resolveMinionCombatClass(promotionStateFromRow(row));
  const levels = normalizeSkillLevelsForClass(
    combatClass,
    parseMinionSkillLevels(row.skillLevelsJson),
  );
  return {
    combatClass,
    levels,
    unspentSkillPoints: Math.max(0, Math.floor(row.unspentSkillPoints ?? 0)),
  };
}

export function ensureDefaultSkillLevels(
  combatClass: MinionCombatClass,
  levels: MinionSkillLevels,
): MinionSkillLevels {
  const out = { ...levels };
  for (const [id, lv] of Object.entries(defaultSkillLevelsForClass(combatClass))) {
    if (out[id] == null || out[id]! < 1) out[id] = lv;
  }
  return normalizeSkillLevelsForClass(combatClass, out);
}

export async function grantSkillPointsOnLevelUp(
  db: Db,
  minionId: string,
  levelsGained: number,
): Promise<{ unspentSkillPoints: number } | null> {
  if (levelsGained <= 0) return null;
  const row = await db.minion.findUnique({
    where: { id: minionId },
    select: { unspentSkillPoints: true },
  });
  if (!row) return null;
  const add = levelsGained * MINION_SKILL_RULES.pointsPerLevel;
  const unspentSkillPoints = Math.max(0, Math.floor(row.unspentSkillPoints ?? 0)) + add;
  await db.minion.update({
    where: { id: minionId },
    data: { unspentSkillPoints },
  });
  return { unspentSkillPoints };
}

export async function applyPromotionSkillUnlock(
  db: Db,
  minionId: string,
  promotionTier: number,
  promotionClass: string,
): Promise<void> {
  const row = await db.minion.findUnique({
    where: { id: minionId },
    select: { skillLevelsJson: true, unspentSkillPoints: true },
  });
  if (!row) return;

  const combatClass = resolveMinionCombatClass({
    promotionTier: promotionTier as MinionPromotionTier,
    promotionClass: promotionClass as MinionCombatClass,
  });
  const levels = mergeSkillLevelsOnPromotion(
    combatClass,
    parseMinionSkillLevels(row.skillLevelsJson),
    promotionTier,
  );
  const bonus = MINION_SKILL_RULES.promotionBonusPoints;
  const unspentSkillPoints = Math.max(0, Math.floor(row.unspentSkillPoints ?? 0)) + bonus;

  await db.minion.update({
    where: { id: minionId },
    data: {
      skillLevelsJson: serializeMinionSkillLevels(levels),
      unspentSkillPoints,
    },
  });
}

export type MinionSkillAllocateResult = {
  minionId: string;
  skillLevels: MinionSkillLevels;
  unspentSkillPoints: number;
  combatClass: MinionCombatClass;
};

export async function allocateMinionSkills(
  db: Db,
  userId: string,
  minionId: string,
  allocation: Record<string, number>,
): Promise<MinionSkillAllocateResult> {
  const spend = Object.values(allocation).reduce(
    (n, v) => n + (typeof v === "number" && v > 0 ? Math.floor(v) : 0),
    0,
  );
  if (spend <= 0) throw new Error("NO_SKILL_POINTS_TO_ALLOCATE");

  const row = await db.minion.findUnique({ where: { id: minionId } });
  if (!row) throw new Error("MINION_NOT_FOUND");
  if (row.userId !== userId) throw new Error("FORBIDDEN");

  const state = skillStateFromMinionRow(row);
  if (spend > state.unspentSkillPoints) throw new Error("INSUFFICIENT_SKILL_POINTS");

  const nextLevels = { ...state.levels };

  for (const [skillId, addRaw] of Object.entries(allocation)) {
    const add = Math.floor(addRaw ?? 0);
    if (add <= 0) continue;
    const def = skillDefById(skillId);
    if (!def) throw new Error(`UNKNOWN_SKILL:${skillId}`);
    const allowed = skillsForCombatClass(state.combatClass).some((s) => s.id === skillId);
    if (!allowed) throw new Error(`SKILL_NOT_AVAILABLE:${skillId}`);
    const cur = nextLevels[skillId] ?? 0;
    if (cur <= 0 && add < 1) throw new Error(`SKILL_LOCKED:${skillId}`);
    nextLevels[skillId] = cur + add;
  }

  const normalized = normalizeSkillLevelsForClass(state.combatClass, nextLevels);
  const unspentSkillPoints = state.unspentSkillPoints - spend;

  await db.minion.update({
    where: { id: minionId },
    data: {
      skillLevelsJson: serializeMinionSkillLevels(normalized),
      unspentSkillPoints,
    },
  });

  return {
    minionId,
    skillLevels: normalized,
    unspentSkillPoints,
    combatClass: state.combatClass,
  };
}

export async function resetMinionSkills(
  db: Db,
  userId: string,
  minionId: string,
): Promise<MinionSkillAllocateResult> {
  const row = await db.minion.findUnique({ where: { id: minionId } });
  if (!row) throw new Error("MINION_NOT_FOUND");
  if (row.userId !== userId) throw new Error("FORBIDDEN");

  const promotion = promotionStateFromRow(row);
  const combatClass = resolveMinionCombatClass(promotion);
  const promotionTier = promotion.promotionTier;
  const current = parseMinionSkillLevels(row.skillLevelsJson);
  const spent = skillPointsSpentAboveBaseline(combatClass, promotionTier, current);
  if (spent <= 0) throw new Error("NOTHING_TO_RESET");

  const skillLevels = baselineSkillLevelsForPromotion(combatClass, promotionTier);
  const unspentSkillPoints = totalEarnedSkillPoints(row.level ?? 1, promotionTier);

  await db.minion.update({
    where: { id: minionId },
    data: {
      skillLevelsJson: serializeMinionSkillLevels(skillLevels),
      unspentSkillPoints,
    },
  });

  return {
    minionId,
    skillLevels,
    unspentSkillPoints,
    combatClass,
  };
}
