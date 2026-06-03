import type { MinionEquipmentView } from "@/shared/minionEquipSlots";

type EquippedArmorPiece = { itemId: string; name: string; grade?: number } | null;

export type MinionEquipmentSource = {
  equippedWeapon: {
    baseItemId: string;
    name: string;
    enhanceLevel: number;
    grade?: number;
  } | null;
  equippedArmor?: {
    helmet: EquippedArmorPiece;
    armor: EquippedArmorPiece;
    pants: EquippedArmorPiece;
    shoes: EquippedArmorPiece;
  };
};

export function buildMinionEquipmentView(m: MinionEquipmentSource | null): MinionEquipmentView {
  if (!m) return {};
  const view: MinionEquipmentView = {};
  if (m.equippedWeapon) {
    view.weapon = {
      baseItemId: m.equippedWeapon.baseItemId,
      name: m.equippedWeapon.name,
      enhanceLevel: m.equippedWeapon.enhanceLevel,
      grade: m.equippedWeapon.grade,
    };
  }
  const armor = m.equippedArmor;
  if (armor?.helmet) {
    view.helmet = {
      baseItemId: armor.helmet.itemId,
      name: armor.helmet.name,
      enhanceLevel: 0,
      grade: armor.helmet.grade,
    };
  }
  if (armor?.armor) {
    view.armor = {
      baseItemId: armor.armor.itemId,
      name: armor.armor.name,
      enhanceLevel: 0,
      grade: armor.armor.grade,
    };
  }
  if (armor?.pants) {
    view.pants = {
      baseItemId: armor.pants.itemId,
      name: armor.pants.name,
      enhanceLevel: 0,
      grade: armor.pants.grade,
    };
  }
  if (armor?.shoes) {
    view.shoes = {
      baseItemId: armor.shoes.itemId,
      name: armor.shoes.name,
      enhanceLevel: 0,
      grade: armor.shoes.grade,
    };
  }
  return view;
}
