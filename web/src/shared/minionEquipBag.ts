import type { MinionEquipSlotId } from "@/shared/minionEquipSlots";
import { normalizeItemIdLower } from "@/shared/itemId";

export type EquipBagCategory = "weapon" | "armor" | "accessory";

export const EQUIP_BAG_CATEGORIES: Array<{ id: EquipBagCategory; label: string }> = [
  { id: "weapon", label: "무기" },
  { id: "armor", label: "방어구" },
];

/** 악세사리 슬롯은 아직 비활성 — 탭도 숨김 */
export const EQUIP_BAG_CATEGORIES_ACTIVE = EQUIP_BAG_CATEGORIES;

const ARMOR_SLOTS = new Set<MinionEquipSlotId>(["helmet", "armor", "pants", "shoes", "gloves"]);
const ACCESSORY_SLOTS = new Set<MinionEquipSlotId>([
  "belt",
  "cape",
  "ring1",
  "ring2",
  "necklace",
  "relic",
]);

export function slotToBagCategory(slotId: MinionEquipSlotId): EquipBagCategory {
  if (slotId === "weapon") return "weapon";
  if (ARMOR_SLOTS.has(slotId)) return "armor";
  return "accessory";
}

export function stackItemBagCategory(itemId: unknown, itemCategory?: string): EquipBagCategory | null {
  const id = normalizeItemIdLower(itemId);
  if (!id) return null;
  const cat = (itemCategory ?? "").trim();
  if (id.startsWith("weapon_") || cat === "무기") return "weapon";
  if (id.startsWith("armor_") || cat === "방어구") return "armor";
  if (id.startsWith("accessory_") || id.startsWith("acc_") || cat === "악세사리") return "accessory";
  return null;
}

export function bagCategoryMatchesSlot(category: EquipBagCategory, slotId: MinionEquipSlotId) {
  return slotToBagCategory(slotId) === category;
}
