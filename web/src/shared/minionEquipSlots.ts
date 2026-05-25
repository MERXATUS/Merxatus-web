/** 미니언 장비 슬롯 (착용 UI·향후 API 공통) */
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
  | "relic";

export type MinionEquipSlotDef = {
  id: MinionEquipSlotId;
  label: string;
  gridArea: string;
};

export const MINION_EQUIP_SLOTS: MinionEquipSlotDef[] = [
  { id: "helmet", label: "투구", gridArea: "helmet" },
  { id: "cape", label: "망토", gridArea: "cape" },
  { id: "ring1", label: "반지", gridArea: "ring1" },
  { id: "gloves", label: "장갑", gridArea: "gloves" },
  { id: "armor", label: "갑옷", gridArea: "armor" },
  { id: "necklace", label: "목걸이", gridArea: "necklace" },
  { id: "ring2", label: "반지2", gridArea: "ring2" },
  { id: "weapon", label: "무기", gridArea: "weapon" },
  { id: "relic", label: "유물", gridArea: "relic" },
  { id: "pants", label: "하의", gridArea: "pants" },
  { id: "belt", label: "벨트", gridArea: "belt" },
  { id: "shoes", label: "신발", gridArea: "shoes" },
];

export type MinionEquippedItemView = {
  baseItemId: string;
  name: string;
  enhanceLevel?: number;
  grade?: number;
  icon?: string | null;
};

export type MinionEquipmentView = Partial<Record<MinionEquipSlotId, MinionEquippedItemView | null>>;

/** DB 아이템·UI가 준비된 슬롯 (무기 + 투구·갑옷·하의·신발) */
export const MINION_EQUIP_SLOTS_ENABLED: MinionEquipSlotId[] = [
  "weapon",
  "helmet",
  "armor",
  "pants",
  "shoes",
];

/** 착용 API가 연동된 슬롯 */
export const MINION_EQUIP_SLOTS_IMPLEMENTED: MinionEquipSlotId[] = [
  "weapon",
  "helmet",
  "armor",
  "pants",
  "shoes",
];

export type MinionArmorDbField =
  | "equippedHelmetItemId"
  | "equippedChestItemId"
  | "equippedPantsItemId"
  | "equippedBootsItemId";

const SLOT_TO_DB: Record<"helmet" | "armor" | "pants" | "shoes", MinionArmorDbField> = {
  helmet: "equippedHelmetItemId",
  armor: "equippedChestItemId",
  pants: "equippedPantsItemId",
  shoes: "equippedBootsItemId",
};

export function isArmorEquipSlot(slotId: MinionEquipSlotId): slotId is "helmet" | "armor" | "pants" | "shoes" {
  return slotId in SLOT_TO_DB;
}

export function armorSlotToDbField(slotId: "helmet" | "armor" | "pants" | "shoes"): MinionArmorDbField {
  return SLOT_TO_DB[slotId];
}

export function isMinionEquipSlotEnabled(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS_ENABLED.includes(slotId);
}

export function isMinionEquipSlotImplemented(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS_IMPLEMENTED.includes(slotId);
}

/** stack 아이템 id가 슬롯과 맞는지 (방어구 — API 연동 전 UI 필터용) */
export function armorStackMatchesSlot(slotId: MinionEquipSlotId, itemId: string) {
  const id = itemId.trim().toLowerCase();
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

export type EquipDragPayload =
  | { kind: "weapon"; weaponInstanceId: string; baseItemId: string }
  | { kind: "stack"; itemId: string };

export const EQUIP_DRAG_MIME = "application/x-merxatus-equip";

export function parseEquipDragPayload(raw: string): EquipDragPayload | null {
  try {
    const p = JSON.parse(raw) as EquipDragPayload;
    if (p.kind === "weapon" && p.weaponInstanceId && p.baseItemId) return p;
    if (p.kind === "stack" && p.itemId) return p;
    return null;
  } catch {
    return null;
  }
}
