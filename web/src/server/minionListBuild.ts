import type { PrismaClient } from "@prisma/client";
import { accessoryIdsFromRow, accessorySlotsFromIds } from "@/server/minionAccessoryDb";
import { armorIdsFromRow, buildArmorLoadoutFromIds, type MinionArmorIds } from "@/server/minionArmorDb";
import { getAccessoryCatalogEntry } from "@/shared/accessoryCatalog";
import type { MinionAccessorySlotId } from "@/shared/minionEquipSlots";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";
import { minionBaseStatsFromRow } from "@/shared/minionBaseStats";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { minionRoleLabel } from "@/server/minionJobs";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
import { promotionStateFromRow } from "@/shared/minionPromotion";
import { minionDisplayName } from "@/shared/minionNickname";
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

export function accessoryEquippedView(accessoryIds: ReturnType<typeof accessoryIdsFromRow>) {
  const slots = accessorySlotsFromIds(accessoryIds);
  const view = {} as Partial<
    Record<MinionAccessorySlotId, { itemId: string; name: string; grade: number } | null>
  >;
  for (const slot of Object.keys(slots) as MinionAccessorySlotId[]) {
    const itemId = slots[slot];
    if (!itemId) {
      view[slot] = null;
      continue;
    }
    const catalog = getAccessoryCatalogEntry(itemId);
    view[slot] = {
      itemId,
      name: catalog?.name ?? itemId,
      grade: catalog?.grade ?? 1,
    };
  }
  return view as Record<MinionAccessorySlotId, { itemId: string; name: string; grade: number } | null>;
}

export function armorEquippedView(
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

export function mapMinionToPartyPickRow(m: MinionRow) {
  const lv = 1;
  const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;
  const combatClass: MinionCombatClass = "ADVENTURER";
  const combatPower = computeMinionCombatPower({
    level: lv,
    fighterRank,
    baseStats: minionBaseStatsFromRow(m),
    combatClass,
    weapon: m.equippedWeaponInstance
      ? {
          baseItemId: m.equippedWeaponInstance.baseItemId,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          optionBonus: weaponCombatBonusFromOptions(
            m.equippedWeaponInstance.optionsJson,
            m.equippedWeaponInstance.baseItemId,
          ),
        }
      : null,
    armor: {},
  });

  const combatClassLabel = minionRoleLabel({ combatClass });

  return {
    id: m.id,
    level: lv,
    pool: "dungeon",
    nickname: m.nickname ?? null,
    displayName: minionDisplayName(m.nickname, combatClassLabel),
    combatClassLabel,
    combatPower,
    combatStats: { combatPower },
    equippedWeapon: m.equippedWeaponInstance?.baseItem
      ? {
          id: m.equippedWeaponInstanceId!,
          baseItemId: m.equippedWeaponInstance.baseItemId,
          name: m.equippedWeaponInstance.baseItem.name,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          ...itemGradeViewForItem(
            m.equippedWeaponInstance.baseItemId,
            m.equippedWeaponInstance.baseItem.grade,
          ),
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
  };
}

export function mapMinionToListRow(
  m: MinionRow,
  armorByMinionId: Map<string, MinionArmorIds>,
  options?: {
    detailMinionId?: string | null;
    armorInstancesById?: Map<string, { baseItemId: string; optionsJson: string }>;
    accessoryByMinionId?: Map<string, ReturnType<typeof accessoryIdsFromRow>>;
  },
) {
  const lv = 1;
  const fighterRank = (m.traits ?? []).find((t) => t.type === "FIGHTER")?.rank ?? 0;
  const armorIds = armorIdsFromRow(armorByMinionId.get(m.id));
  const accessoryIds = accessoryIdsFromRow(options?.accessoryByMinionId?.get(m.id));
  const armorInstMap = options?.armorInstancesById ?? new Map();
  const baseStats = minionBaseStatsFromRow(m);
  const promotion = promotionStateFromRow(m);
  const combatClass: MinionCombatClass = "ADVENTURER";

  const combatInput = {
    level: lv,
    fighterRank,
    baseStats,
    combatClass,
    weapon: m.equippedWeaponInstance
      ? {
          baseItemId: m.equippedWeaponInstance.baseItemId,
          enhanceLevel: m.equippedWeaponInstance.enhanceLevel,
          optionBonus: weaponCombatBonusFromOptions(
            m.equippedWeaponInstance.optionsJson,
            m.equippedWeaponInstance.baseItemId,
          ),
          optionsJson: m.equippedWeaponInstance.optionsJson,
        }
      : null,
    armor: buildArmorLoadoutFromIds(armorIds, armorInstMap),
    accessories: accessorySlotsFromIds(accessoryIds),
  };

  const needDetail = options?.detailMinionId === m.id;
  const combatPower = computeMinionCombatPower(combatInput);
  const combatStats: MinionCombatBreakdown | undefined = needDetail
    ? computeMinionCombatBreakdown(combatInput)
    : undefined;

  const combatClassLabel = minionRoleLabel({ combatClass });

  return {
    id: m.id,
    level: lv,
    supportsLeveling: false,
    experience: 0,
    xpToNext: 0,
    xpProgress: 0,
    unspentStatPoints: 0,
    unspentSkillPoints: 0,
    isMaxLevel: true,
    jobType: m.jobType,
    baseStats,
    combatClass,
    combatPower,
    promotionTier: promotion.promotionTier,
    promotionClass: promotion.promotionClass,
    canPromoteFirst: false,
    canPromoteSecond: false,
    canPromoteThird: false,
    nextPromotionLabel: null,
    skills: [],
    combatClassLabel,
    nickname: m.nickname ?? null,
    displayName: minionDisplayName(m.nickname, combatClassLabel),
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
          ...itemGradeViewForItem(
            m.equippedWeaponInstance.baseItemId,
            m.equippedWeaponInstance.baseItem.grade,
          ),
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
    equippedAccessories: accessoryEquippedView(accessoryIds),
    ...(combatStats ? { combatStats } : {}),
    traits: (m.traits ?? []).map((t) => ({ type: t.type, rank: t.rank, xp: t.xp })),
  };
}
