import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import {
  armorIdsFromRow,
  buildArmorLoadoutFromIds,
  loadMinionArmorIdsForUser,
  loadArmorInstanceMapForIds,
} from "@/server/minionArmorDb";
import { resetMinionStats } from "@/server/minionLevelUp";
import { minionRoleLabel } from "@/server/minionJobs";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionLevelProgress } from "@/shared/minionLevel";
import {
  minionPromotionAvailability,
  promotionStateFromRow,
  resolveMinionCombatClass,
} from "@/shared/minionPromotion";
import { skillViewsForMinion } from "@/shared/minionSkills";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  minionId: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reset = await resetMinionStats(tx, auth.userId, parsed.data.minionId);

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
      const promotion = promotionStateFromRow(m);
      const combatClass = resolveMinionCombatClass(promotion);
      const combatStats = buildMinionCombatBreakdown({
        level: m.level ?? 1,
        fighterRank,
        baseStats: reset.baseStats,
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
      const promotionInfo = minionPromotionAvailability({
        combatPower: combatStats.combatPower,
        promotionTier: promotion.promotionTier,
      });

      return {
        ok: true as const,
        minionId: m.id,
        baseStats: reset.baseStats,
        unspentStatPoints: reset.unspentStatPoints,
        level: m.level ?? 1,
        experience: 0,
        xpToNext: 0,
        xpProgress: 0,
        isMaxLevel: true,
        supportsLeveling: false,
        combatClass,
        combatClassLabel: minionRoleLabel({ combatClass }),
        promotionTier: promotion.promotionTier,
        canPromoteFirst: promotionInfo.canPromoteFirst,
        canPromoteSecond: promotionInfo.canPromoteSecond,
        canPromoteThird: promotionInfo.canPromoteThird,
        skills: skillViewsForMinion({ combatClass, skillLevelsJson: m.skillLevelsJson }),
        unspentSkillPoints: m.unspentSkillPoints ?? 0,
        combatStats,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "MINION_NOT_FOUND" || message === "NOTHING_TO_RESET"
        ? 400
        : message === "FORBIDDEN"
          ? 403
          : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
