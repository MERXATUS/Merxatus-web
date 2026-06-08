import type { MinionEquipmentView, MinionEquippedItemView } from "@/shared/minionEquipSlots";

type EquippedArmorPiece = {
  itemId: string;
  instanceId?: string | null;
  name: string;
  grade?: number;
} | null;

export type MinionEquipInstanceRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel?: number;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: MinionEquippedItemView["options"];
  icon?: string | null;
  iconSrc?: string;
};

export type MinionEquipmentSource = {
  equippedWeapon: {
    id?: string;
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

function weaponPiece(
  w: NonNullable<MinionEquipmentSource["equippedWeapon"]>,
  inst?: MinionEquipInstanceRow,
): MinionEquippedItemView {
  return {
    baseItemId: w.baseItemId,
    name: w.name,
    enhanceLevel: w.enhanceLevel,
    grade: w.grade ?? inst?.grade,
    icon: inst?.icon,
    instanceId: w.id ?? inst?.id,
    gradeLabel: inst?.gradeLabel,
    identified: inst?.identified,
    options: inst?.options,
    equipKind: "weapon",
  };
}

function armorPiece(
  piece: NonNullable<EquippedArmorPiece>,
  inst?: MinionEquipInstanceRow,
): MinionEquippedItemView {
  const hasInstance = !!piece.instanceId && !!inst;
  return {
    baseItemId: piece.itemId,
    name: piece.name,
    enhanceLevel: inst?.enhanceLevel ?? 0,
    grade: piece.grade ?? inst?.grade,
    icon: inst?.icon,
    instanceId: piece.instanceId ?? inst?.id,
    gradeLabel: inst?.gradeLabel,
    identified: inst?.identified,
    options: inst?.options,
    equipKind: hasInstance ? "armor" : "stack",
  };
}

function lookupInstance(
  instanceId: string | null | undefined,
  rows: MinionEquipInstanceRow[],
): MinionEquipInstanceRow | undefined {
  if (!instanceId) return undefined;
  return rows.find((r) => r.id === instanceId);
}

/** 홈·던전 등 — 인스턴스 목록 없이 기본 정보만 */
export function buildMinionEquipmentView(m: MinionEquipmentSource | null): MinionEquipmentView {
  return buildMinionEquipmentViewWithTooltips(m);
}

/** 미니언 패널 — weapon/armorInstances로 옵션·감정 등 툴팁 데이터 포함 */
export function buildMinionEquipmentViewWithTooltips(
  m: MinionEquipmentSource | null,
  instances?: {
    weaponInstances?: MinionEquipInstanceRow[];
    armorInstances?: MinionEquipInstanceRow[];
  },
): MinionEquipmentView {
  if (!m) return {};
  const weapons = instances?.weaponInstances ?? [];
  const armors = instances?.armorInstances ?? [];
  const view: MinionEquipmentView = {};

  if (m.equippedWeapon) {
    const inst = lookupInstance(m.equippedWeapon.id, weapons);
    view.weapon = weaponPiece(m.equippedWeapon, inst);
  }

  const armor = m.equippedArmor;
  if (armor?.helmet) {
    view.helmet = armorPiece(armor.helmet, lookupInstance(armor.helmet.instanceId, armors));
  }
  if (armor?.armor) {
    view.armor = armorPiece(armor.armor, lookupInstance(armor.armor.instanceId, armors));
  }
  if (armor?.pants) {
    view.pants = armorPiece(armor.pants, lookupInstance(armor.pants.instanceId, armors));
  }
  if (armor?.shoes) {
    view.shoes = armorPiece(armor.shoes, lookupInstance(armor.shoes.instanceId, armors));
  }

  return view;
}
