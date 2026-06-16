import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { buildMinionCombatBreakdown } from "@/server/minionCombatBuild";
import { armorIdsFromRow, buildArmorLoadoutFromIds, loadMinionArmorIdsForUser, loadArmorInstanceMapForIds } from "@/server/minionArmorDb";
import { minionSupportsLeveling, minionRoleLabel } from "@/server/minionJobs";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionCombatClassLabel } from "@/shared/minionDerivedClass";
import { minionLevelProgress } from "@/shared/minionLevel";
import {
  canAttemptFirstPromotion,
  canAttemptSecondPromotion,
  canAttemptThirdPromotion,
  minionPromotionAvailability,
  promotionStateFromRow,
  resolveMinionCombatClass,
  validateFirstPromotion,
  validateSecondPromotion,
  validateThirdPromotion,
} from "@/shared/minionPromotion";
import { applyPromotionSkillUnlock, skillStateFromMinionRow } from "@/server/minionSkills";
import { serializeMinionSkillLevels, skillViewsForMinion } from "@/shared/minionSkills";

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
      const m = await tx.minion.findUnique({
        where: { id: parsed.data.minionId },
        include: {
          traits: true,
          equippedWeaponInstance: { include: { baseItem: true } },
        },
      });
      if (!m) throw new Error("MINION_NOT_FOUND");
      if (m.userId !== auth.userId) throw new Error("FORBIDDEN");

      const level = m.level ?? 1;
      const promotion = promotionStateFromRow(m);
      const baseStats = minionBaseStatsFromRow(m);
      const weaponBaseItemId = m.equippedWeaponInstance?.baseItemId ?? null;

      let nextTier = promotion.promotionTier;
      let nextClass = promotion.promotionClass;

      if (canAttemptFirstPromotion(level, promotion.promotionTier)) {
        const check = validateFirstPromotion(weaponBaseItemId);
        if (!check.ok) throw new Error(check.error);
        nextTier = 1;
        nextClass = check.promotionClass;
      } else if (canAttemptSecondPromotion(level, promotion.promotionTier)) {
        const check = validateSecondPromotion(baseStats);
        if (!check.ok) throw new Error(check.error);
        nextTier = 2;
        nextClass = check.promotionClass;
      } else if (canAttemptThirdPromotion(level, promotion.promotionTier)) {
        const check = validateThirdPromotion(promotion.promotionClass);
        if (!check.ok) throw new Error(check.error);
        nextTier = 3;
        nextClass = check.promotionClass;
      } else {
        throw new Error("PROMOTION_NOT_AVAILABLE");
      }

      await tx.minion.update({
        where: { id: m.id },
        data: {
          promotionTier: nextTier,
          promotionClass: nextClass,
        } as Prisma.MinionUpdateInput,
      });

      await applyPromotionSkillUnlock(tx, m.id, nextTier, nextClass);

      const updated = await tx.minion.findUniqueOrThrow({ where: { id: m.id } });
      const skillState = skillStateFromMinionRow(updated);
      const newPromotion = promotionStateFromRow(updated);
      const combatClass = resolveMinionCombatClass(newPromotion);
      const combatClassLabel = minionRoleLabel({ combatClass });

      const armorByMinionId = await loadMinionArmorIdsForUser(tx, auth.userId);
      const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
      const armorInstMap = await loadArmorInstanceMapForIds(tx, auth.userId, armorIds);
      const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;

      const combatStats = buildMinionCombatBreakdown({
        level,
        fighterRank,
        baseStats,
        combatClass,
        skillLevelsJson: serializeMinionSkillLevels(skillState.levels),
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
        level,
        experience: m.experience ?? 0,
        unspentStatPoints: m.unspentStatPoints ?? 0,
      });

      const promotionInfo = minionPromotionAvailability({
        level,
        promotionTier: newPromotion.promotionTier,
      });

      return {
        ok: true as const,
        minionId: m.id,
        promotionTier: newPromotion.promotionTier,
        promotionClass: newPromotion.promotionClass,
        combatClass,
        combatClassLabel,
        promotionLabel: minionCombatClassLabel(combatClass),
        ...promotionInfo,
        skills: skillViewsForMinion({
          combatClass,
          skillLevelsJson: serializeMinionSkillLevels(skillState.levels),
        }),
        unspentSkillPoints: skillState.unspentSkillPoints,
        level: levelProgress.level,
        experience: levelProgress.experience,
        xpToNext: levelProgress.xpToNext,
        xpProgress: levelProgress.xpProgress,
        isMaxLevel: levelProgress.isMaxLevel,
        combatStats,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "MINION_NOT_FOUND" ||
      message === "NO_SWORD_EQUIPPED" ||
      message === "NO_STATS_FOR_PROMOTION" ||
      message === "NO_MASTER_CLASS" ||
      message === "PROMOTION_NOT_AVAILABLE" ||
      message === "GATHER_MINION_NO_PROMOTION"
        ? 400
        : message === "FORBIDDEN"
          ? 403
          : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
