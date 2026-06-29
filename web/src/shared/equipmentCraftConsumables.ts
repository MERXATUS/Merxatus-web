import type { ItemLevelTier } from "@/shared/equipmentItemLevel";

export const ITEM_CRAFT_QUALITY_STONE = "item_craft_quality_stone";
export const ITEM_CRAFT_LEVEL_TIER1 = "item_craft_level_tier1";
export const ITEM_CRAFT_LEVEL_TIER2 = "item_craft_level_tier2";
export const ITEM_CRAFT_LEVEL_TIER3 = "item_craft_level_tier3";

export type EquipmentCraftConsumableKind = "quality_up" | "level_tier1" | "level_tier2" | "level_tier3";

const BY_ITEM_ID: Record<string, EquipmentCraftConsumableKind> = {
  [ITEM_CRAFT_QUALITY_STONE]: "quality_up",
  [ITEM_CRAFT_LEVEL_TIER1]: "level_tier1",
  [ITEM_CRAFT_LEVEL_TIER2]: "level_tier2",
  [ITEM_CRAFT_LEVEL_TIER3]: "level_tier3",
};

const KIND_TO_TIER: Partial<Record<EquipmentCraftConsumableKind, ItemLevelTier>> = {
  level_tier1: 1,
  level_tier2: 2,
  level_tier3: 3,
};

export function equipmentCraftConsumableKind(itemId: string): EquipmentCraftConsumableKind | null {
  return BY_ITEM_ID[itemId.trim().toLowerCase()] ?? null;
}

export function isEquipmentCraftConsumableItemId(itemId: string): boolean {
  return equipmentCraftConsumableKind(itemId) != null;
}

export function itemLevelTierForCraftKind(kind: EquipmentCraftConsumableKind): ItemLevelTier | null {
  return KIND_TO_TIER[kind] ?? null;
}

export const EQUIPMENT_CRAFT_CONSUMABLE_ITEM_IDS = Object.keys(BY_ITEM_ID);

export function equipmentCraftConsumableLabel(kind: EquipmentCraftConsumableKind): string {
  switch (kind) {
    case "quality_up":
      return "품질 연마제";
    case "level_tier1":
      return "하급 레벨각인";
    case "level_tier2":
      return "중급 레벨각인";
    case "level_tier3":
      return "상급 레벨각인";
  }
}
