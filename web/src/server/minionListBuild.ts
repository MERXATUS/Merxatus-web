import type { PrismaClient } from "@prisma/client";
import { armorIdsFromRow, buildArmorLoadoutFromIds, type MinionArmorIds } from "@/server/minionArmorDb";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { minionLevelProgress } from "@/shared/minionLevel";
import { minionRoleLabel } from "@/server/minionJobs";
import {
  minionPromotionAvailability,
  promotionStateFromRow,
  resolveMinionCombatClass,
} from "@/shared/minionPromotion";
import { skillViewsForCombatClass } from "@/shared/minionSkills";
import { getArmorStats } from "@/shared/armorStatsData";
import {
  armorSlotsFromMinionRow,
  computeMinionCombatBreakdown,
  computeMinionCombatPower,
  type MinionCombatBreakdown,
} from "@/shared/minionCombatStats";

type MinionRow = Awaited<ReturnType<PrismaClient["minion"]["findMany"]>>[number] & {
  traits?: Array<{ type: string; rank: number; xp: number }>;
  equippedWeaponInstance?: {
    id?: string;
    baseItemId: string;
    enhanceLevel: number;
    optionsJson: string | null;
    baseItem?: { id: string; name: string; grade: number };
  } | null;
};

function armorEquippedView(
  armorIds: MinionArmorIds,
  instancesById?: Map<string, { baseItemId: string; optionsJson: string }>,
) {
  const loadout = buildArmorLoadoutFromIds(armorIds, instancesById ?? new Map());
  const viewSlot = (slot: "helmet" | "armor" | "pants" | "shoes", instField: keyof MinionArmorIds) => {
    const piece = loadout[slot];
    if (!piece?.itemId) return null;
    const row = getArmorStats(piece.itemId);
    return {
      itemId: piece.itemId,
      instanceId: (armorIds[instField] as string | null) ?? null,
      name: row?.name ?? piece.itemId,
      grade: row?.grade ?? 1,
    };
  };
  return {
    helmet: viewSlot("helmet", "equippedHelmetInstanceId"),
    armor: viewSlot("armor", "equippedChestInstanceId"),
    pants: viewSlot("pants", "equippedPantsInstanceId"),
    shoes: viewSlot("shoes", "equippedBootsInstanceId"),
  };
}

export function mapMinionToListRow(
  m: MinionRow,
  armorByMinionId: Map<string, MinionArmorIds>,
  options?: {
    detailMinionId?: string | null;
    armorInstancesById?: Map<string, { baseItemId: string; optionsJson: string }>;
  },
) {
  const lv = m.level ?? 1;
  const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;
  const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
  const armorInstMap = options?.armorInstancesById ?? new Map();
  const baseStats = minionBaseStatsFromRow(m);
  const promotion = promotionStateFromRow(m);
  const combatClass = resolveMinionCombatClass(promotion);
  const promotionInfo = minionPromotionAvailability({ level: lv, promotionTier: promotion.promotionTier });
  const skills = skillViewsForCombatClass(combatClass);
  const levelProgress = minionLevelProgress({
    level: lv,
    experience: m.experience ?? 0,
    unspentStatPoints: m.unspentStatPoints ?? 0,
  });

  const combatInput = {
    level: lv,
    fighterRank,
    baseStats,
    weapon: m.equippedWeaponInstance
      ? {
          baseItemId: m.equippedWeaponInstance.baseItemId,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          optionBonus: weaponCombatBonusFromOptions(m.equippedWeaponInstance.optionsJson),
          optionsJson: m.equippedWeaponInstance.optionsJson,
        }
      : null,
    armor: buildArmorLoadoutFromIds(armorIds, armorInstMap),
  };

  const needDetail = options?.detailMinionId === m.id;
  const combatPower = computeMinionCombatPower(combatInput);
  const combatStats: MinionCombatBreakdown | undefined = needDetail
    ? computeMinionCombatBreakdown(combatInput)
    : undefined;

  return {
    id: m.id,
    level: lv,
    supportsLeveling: true,
    experience: levelProgress.experience,
    xpToNext: levelProgress.xpToNext,
    xpProgress: levelProgress.xpProgress,
    unspentStatPoints: levelProgress.unspentStatPoints,
    isMaxLevel: levelProgress.isMaxLevel,
    jobType: m.jobType,
    baseStats,
    combatClass,
    combatPower,
    promotionTier: promotion.promotionTier,
    promotionClass: promotion.promotionClass,
    canPromoteFirst: promotionInfo.canPromoteFirst,
    canPromoteSecond: promotionInfo.canPromoteSecond,
    nextPromotionLabel: promotionInfo.nextPromotionLabel,
    skills,
    combatClassLabel: minionRoleLabel({ combatClass }),
    equippedWeaponInstanceId: m.equippedWeaponInstanceId ?? null,
    equippedHelmetItemId: armorIds.equippedHelmetItemId,
    equippedChestItemId: armorIds.equippedChestItemId,
    equippedPantsItemId: armorIds.equippedPantsItemId,
    equippedBootsItemId: armorIds.equippedBootsItemId,
    equippedWeapon: m.equippedWeaponInstance?.baseItem
      ? {
          id: m.equippedWeaponInstanceId!,
          baseItemId: m.equippedWeaponInstance.baseItemId,
          name: m.equippedWeaponInstance.baseItem.name,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          grade: m.equippedWeaponInstance.baseItem.grade,
          optionBonus: combatInput.weapon?.optionBonus ?? 0,
        }
      : m.equippedWeaponInstance
        ? {
            id: m.equippedWeaponInstanceId!,
            baseItemId: m.equippedWeaponInstance.baseItemId,
            name: m.equippedWeaponInstance.baseItemId,
            enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
            grade: 1,
          }
        : null,
    equippedArmor: armorEquippedView(armorIds, armorInstMap),
    ...(combatStats ? { combatStats } : {}),
    traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank, xp: t.xp })),
  };
}
