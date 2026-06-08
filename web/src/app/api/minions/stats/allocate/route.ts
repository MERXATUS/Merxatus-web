import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import { armorIdsFromRow, buildArmorLoadoutFromIds, loadMinionArmorIdsForUser, loadArmorInstanceMapForIds } from "@/server/minionArmorDb";
import { allocateMinionStats } from "@/server/minionLevelUp";
import { minionSupportsLeveling } from "@/server/minionJobs";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionLevelProgress } from "@/shared/minionLevel";
import { MINION_STAT_KEYS } from "@/shared/minionBaseStats";
import { minionRoleLabel } from "@/server/minionJobs";
import {
  minionPromotionAvailability,
  promotionStateFromRow,
  resolveMinionCombatClass,
} from "@/shared/minionPromotion";
import { skillViewsForMinion } from "@/shared/minionSkills";

export const runtime = "nodejs";

const StatSchema = z.object({
  strength: z.number().int().min(0).optional(),
  agility: z.number().int().min(0).optional(),
  intelligence: z.number().int().min(0).optional(),
  endurance: z.number().int().min(0).optional(),
});

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  minionId: z.string().min(1),
  stats: StatSchema,
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const spend = MINION_STAT_KEYS.reduce((n, k) => n + (parsed.data.stats[k] ?? 0), 0);
  if (spend <= 0) return Response.json({ ok: false, error: "NO_STAT_POINTS_TO_ALLOCATE" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const allocated = await allocateMinionStats(tx, auth.userId, parsed.data.minionId, parsed.data.stats);

      const m = await tx.minion.findUnique({
        where: { id: parsed.data.minionId },
        include: {
          traits: true,
          equippedWeaponInstance: { include: { baseItem: true } },
        },
      });
      if (!m) throw new Error("MINION_NOT_FOUND");

      const armorByMinionId = await loadMinionArmorIdsForUser(tx, auth.userId);
      const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
      const armorInstMap = await loadArmorInstanceMapForIds(tx, auth.userId, armorIds);
      const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;
      const baseStats = minionBaseStatsFromRow(m);
      const promotion = promotionStateFromRow(m);
      const combatClass = resolveMinionCombatClass(promotion);
      const promotionInfo = minionPromotionAvailability({
        level: m.level ?? 1,
        promotionTier: promotion.promotionTier,
      });

      const combatStats = buildMinionCombatBreakdown({
        level: m.level ?? 1,
        fighterRank,
        baseStats,
        combatClass,
        skillLevelsJson: m.skillLevelsJson,
        weapon: m.equippedWeaponInstance
          ? {
              baseItemId: m.equippedWeaponInstance.baseItemId,
              enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
              optionsJson: m.equippedWeaponInstance.optionsJson,
            }
          : null,
        armor: buildArmorLoadoutFromIds(armorIds, armorInstMap),
      });

      const levelProgress = minionLevelProgress({
        level: m.level ?? 1,
        experience: m.experience ?? 0,
        unspentStatPoints: allocated.unspentStatPoints,
      });

      return {
        ok: true as const,
        minionId: m.id,
        baseStats: allocated.baseStats,
        unspentStatPoints: allocated.unspentStatPoints,
        level: levelProgress.level,
        experience: levelProgress.experience,
        xpToNext: levelProgress.xpToNext,
        xpProgress: levelProgress.xpProgress,
        isMaxLevel: levelProgress.isMaxLevel,
        combatClass,
        combatClassLabel: minionRoleLabel({ combatClass }),
        promotionTier: promotion.promotionTier,
        canPromoteFirst: promotionInfo.canPromoteFirst,
        canPromoteSecond: promotionInfo.canPromoteSecond,
        skills: skillViewsForMinion({ combatClass, skillLevelsJson: m.skillLevelsJson }),
        unspentSkillPoints: m.unspentSkillPoints ?? 0,
        combatStats,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "MINION_NOT_FOUND" || message.startsWith("STAT_CAP_EXCEEDED")
        ? 400
        : message === "FORBIDDEN"
          ? 403
          : message === "INSUFFICIENT_STAT_POINTS"
            ? 400
            : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
