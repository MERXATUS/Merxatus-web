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
import { allocateMinionSkills } from "@/server/minionSkills";
import { minionRoleLabel } from "@/server/minionJobs";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import {
  minionPromotionAvailability,
  promotionStateFromRow,
  resolveMinionCombatClass,
} from "@/shared/minionPromotion";
import { serializeMinionSkillLevels, skillViewsForMinion } from "@/shared/minionSkills";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  minionId: z.string().min(1),
  skills: z.record(z.string(), z.number().int().min(0)),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const spend = Object.values(parsed.data.skills).reduce((n, v) => n + (v > 0 ? v : 0), 0);
  if (spend <= 0) return Response.json({ ok: false, error: "NO_SKILL_POINTS_TO_ALLOCATE" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const allocated = await allocateMinionSkills(
        tx,
        auth.userId,
        parsed.data.minionId,
        parsed.data.skills,
      );

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
        skillLevelsJson: serializeMinionSkillLevels(allocated.skillLevels),
        weapon: m.equippedWeaponInstance
          ? {
              baseItemId: m.equippedWeaponInstance.baseItemId,
              enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
              optionsJson: m.equippedWeaponInstance.optionsJson,
            }
          : null,
        armor: buildArmorLoadoutFromIds(armorIds, armorInstMap),
      });

      return {
        ok: true as const,
        minionId: m.id,
        unspentSkillPoints: allocated.unspentSkillPoints,
        combatClass,
        combatClassLabel: minionRoleLabel({ combatClass }),
        promotionTier: promotion.promotionTier,
        canPromoteFirst: promotionInfo.canPromoteFirst,
        canPromoteSecond: promotionInfo.canPromoteSecond,
        canPromoteThird: promotionInfo.canPromoteThird,
        skills: skillViewsForMinion({
          combatClass,
          skillLevelsJson: serializeMinionSkillLevels(allocated.skillLevels),
        }),
        combatStats,
        combatPower: combatStats.combatPower,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "MINION_NOT_FOUND" ||
      message.startsWith("UNKNOWN_SKILL:") ||
      message.startsWith("SKILL_NOT_AVAILABLE:") ||
      message.startsWith("SKILL_LOCKED:")
        ? 400
        : message === "FORBIDDEN"
          ? 403
          : message === "INSUFFICIENT_SKILL_POINTS"
            ? 400
            : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
