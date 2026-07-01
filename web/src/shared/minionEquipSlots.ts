/** 미니언 장비 슬롯 (착용 UI·API 공통) */

import { accessoryMatchesSlot } from "@/shared/accessoryCatalog";
import { normalizeItemIdLower } from "@/shared/itemId";

export type MinionEquipSlotId =
  | "helmet"
  | "armor"
  | "pants"
  | "shoes"
  | "gloves"
  | "weapon"
  | "belt"
  | "cape"
  | "ring1"
  | "ring2"
  | "necklace"
  | "necklace2"
  | "relic"
  | "relic2"
  | "relic3";

export type MinionAccessorySlotId = "ring1" | "ring2" | "necklace" | "necklace2" | "relic" | "relic2" | "relic3";

export type MinionEquipSlotDef = {
  id: MinionEquipSlotId;
  label: string;
  /** 좁은 슬롯(모바일 스트립)용 짧은 라벨 */
  shortLabel?: string;
  gridArea: string;
};

export const MINION_EQUIP_SLOTS: MinionEquipSlotDef[] = [
  { id: "helmet", label: "투구", shortLabel: "투", gridArea: "helmet" },
  { id: "cape", label: "망토", shortLabel: "망", gridArea: "cape" },
  { id: "ring1", label: "반지", shortLabel: "반1", gridArea: "ring1" },
  { id: "gloves", label: "장갑", shortLabel: "갑", gridArea: "gloves" },
  { id: "armor", label: "갑옷", shortLabel: "옷", gridArea: "armor" },
  { id: "necklace", label: "목걸이", shortLabel: "목1", gridArea: "necklace" },
  { id: "ring2", label: "반지2", shortLabel: "반2", gridArea: "ring2" },
  { id: "weapon", label: "무기", shortLabel: "무", gridArea: "weapon" },
  { id: "relic", label: "유물", shortLabel: "유1", gridArea: "relic" },
  { id: "necklace2", label: "목걸이2", shortLabel: "목2", gridArea: "necklace2" },
  { id: "pants", label: "하의", shortLabel: "하", gridArea: "pants" },
  { id: "relic2", label: "유물2", shortLabel: "유2", gridArea: "relic2" },
  { id: "belt", label: "벨트", shortLabel: "벨", gridArea: "belt" },
  { id: "relic3", label: "유물3", shortLabel: "유3", gridArea: "relic3" },
  { id: "shoes", label: "신발", shortLabel: "신", gridArea: "shoes" },
];

export type MinionEquippedItemView = {
  baseItemId: string;
  name: string;
  enhanceLevel?: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  grade?: number;
  icon?: string | null;
  instanceId?: string;
  gradeLabel?: string;
  identified?: boolean;
  options?: Array<{
    kind: string;
    optionId?: string;
    label: string;
    tier: number;
    tierLabel: string;
    displayValue: number;
    isPercent?: boolean;
    flatBonus?: number;
    hidden?: boolean;
    locked?: boolean;
  }>;
  equipKind?: "weapon" | "armor" | "stack" | "accessory";
};

export type MinionEquipmentView = Partial<Record<MinionEquipSlotId, MinionEquippedItemView | null>>;

export const MINION_ACCESSORY_SLOTS: MinionAccessorySlotId[] = [
  "ring1",
  "ring2",
  "necklace",
  "necklace2",
  "relic",
  "relic2",
  "relic3",
];

export const MINION_EQUIP_SLOTS_ENABLED: MinionEquipSlotId[] = [
  "weapon",
  "helmet",
  "armor",
  "pants",
  "shoes",
  ...MINION_ACCESSORY_SLOTS,
];

export const MINION_EQUIP_SLOTS_IMPLEMENTED: MinionEquipSlotId[] = [
  "weapon",
  "helmet",
  "armor",
  "pants",
  "shoes",
  ...MINION_ACCESSORY_SLOTS,
];

export function minionEquipSlotsEnabledForPool(_pool?: string): MinionEquipSlotId[] {
  return MINION_EQUIP_SLOTS_ENABLED;
}

export type MinionArmorDbField =
  | "equippedHelmetItemId"
  | "equippedChestItemId"
  | "equippedPantsItemId"
  | "equippedBootsItemId";

export type MinionAccessoryDbField =
  | "equippedRing1ItemId"
  | "equippedRing2ItemId"
  | "equippedNecklaceItemId"
  | "equippedNecklace2ItemId"
  | "equippedRelicItemId"
  | "equippedRelic2ItemId"
  | "equippedRelic3ItemId";

const SLOT_TO_DB: Record<"helmet" | "armor" | "pants" | "shoes", MinionArmorDbField> = {
  helmet: "equippedHelmetItemId",
  armor: "equippedChestItemId",
  pants: "equippedPantsItemId",
  shoes: "equippedBootsItemId",
};

const ACCESSORY_SLOT_TO_DB: Record<MinionAccessorySlotId, MinionAccessoryDbField> = {
  ring1: "equippedRing1ItemId",
  ring2: "equippedRing2ItemId",
  necklace: "equippedNecklaceItemId",
  necklace2: "equippedNecklace2ItemId",
  relic: "equippedRelicItemId",
  relic2: "equippedRelic2ItemId",
  relic3: "equippedRelic3ItemId",
};

export function isArmorEquipSlot(slotId: MinionEquipSlotId): slotId is "helmet" | "armor" | "pants" | "shoes" {
  return slotId in SLOT_TO_DB;
}

export function isAccessoryEquipSlot(slotId: MinionEquipSlotId): slotId is MinionAccessorySlotId {
  return slotId in ACCESSORY_SLOT_TO_DB;
}

export function armorSlotToDbField(slotId: "helmet" | "armor" | "pants" | "shoes"): MinionArmorDbField {
  return SLOT_TO_DB[slotId];
}

export function accessorySlotToDbField(slotId: MinionAccessorySlotId): MinionAccessoryDbField {
  return ACCESSORY_SLOT_TO_DB[slotId];
}

export function isMinionEquipSlotEnabled(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS_ENABLED.includes(slotId);
}

export function isMinionEquipSlotImplemented(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS_IMPLEMENTED.includes(slotId);
}

export function armorStackMatchesSlot(slotId: MinionEquipSlotId, itemId: unknown) {
  const id = normalizeItemIdLower(itemId);
  if (!id) return false;
  if (!id.startsWith("armor_")) return false;
  switch (slotId) {
    case "helmet":
      return id.includes("helmet");
    case "armor":
      return id.endsWith("_armor");
    case "pants":
      return id.includes("_pants");
    case "shoes":
      return id.includes("_boots");
    default:
      return false;
  }
}

export function accessoryStackMatchesSlot(slotId: MinionEquipSlotId, itemId: unknown) {
  if (!isAccessoryEquipSlot(slotId)) return false;
  const id = normalizeItemIdLower(itemId);
  if (!id) return false;
  return id.startsWith("acc_") && accessoryMatchesSlot(id, slotId);
}

export type EquipDragPayload =
  | { kind: "weapon"; weaponInstanceId: string; baseItemId: string }
  | { kind: "armor"; armorInstanceId: string; baseItemId: string }
  | { kind: "stack"; itemId: string };

export const EQUIP_DRAG_MIME = "application/x-merxatus-equip";

export function parseEquipDragPayload(raw: string): EquipDragPayload | null {
  try {
    const p = JSON.parse(raw) as EquipDragPayload;
    if (p.kind === "weapon" && p.weaponInstanceId && p.baseItemId) return p;
    if (p.kind === "armor" && p.armorInstanceId && p.baseItemId) return p;
    if (p.kind === "stack" && p.itemId) return p;
    return null;
  } catch {
    return null;
  }
}
