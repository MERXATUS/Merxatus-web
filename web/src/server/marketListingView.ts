import { formatEquipmentOptionDisplay, parseEquipmentOptionsPayload } from "@/server/equipmentOptions";
import { itemGradeViewForItem } from "@/server/itemGrade";
import type { EquipmentOptionDisplayRow } from "@/server/equipmentOptions";

export type MarketListingEquipmentView = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade: number;
  gradeLabel: string;
  identified: boolean;
  options: EquipmentOptionDisplayRow[];
};

type EquipmentInstanceRow = {
  id: string;
  baseItemId: string;
  enhanceLevel: number;
  optionsJson: string;
  baseItem: { name: string; grade: number };
};

export function marketListingWeaponView(inst: EquipmentInstanceRow): MarketListingEquipmentView {
  const gradeView = itemGradeViewForItem(inst.baseItemId, inst.baseItem.grade);
  return {
    id: inst.id,
    baseItemId: inst.baseItemId,
    name: inst.baseItem.name,
    enhanceLevel: inst.enhanceLevel,
    grade: gradeView.grade,
    gradeLabel: gradeView.gradeLabel,
    identified: parseEquipmentOptionsPayload(inst.optionsJson).identified,
    options: formatEquipmentOptionDisplay(inst.optionsJson, "weapon"),
  };
}

export function marketListingArmorView(inst: EquipmentInstanceRow): MarketListingEquipmentView {
  const gradeView = itemGradeViewForItem(inst.baseItemId, inst.baseItem.grade);
  return {
    id: inst.id,
    baseItemId: inst.baseItemId,
    name: inst.baseItem.name,
    enhanceLevel: inst.enhanceLevel,
    grade: gradeView.grade,
    gradeLabel: gradeView.gradeLabel,
    identified: parseEquipmentOptionsPayload(inst.optionsJson).identified,
    options: formatEquipmentOptionDisplay(inst.optionsJson, "armor"),
  };
}
