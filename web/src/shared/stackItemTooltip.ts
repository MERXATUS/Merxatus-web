import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import {
  isMinionRecruitCategory,
  isMinionRecruitItemId,
} from "@/shared/minionRecruit";
import { getArmorStats, isArmorInventoryItem, armorSlotLabelKo } from "@/shared/armorStatsData";
import { isOptionConsumableItemId } from "@/shared/optionConsumables";

export type StackItemTooltipData = {
  itemId: string;
  name: string;
  category: string;
  grade?: number;
  gradeLabel?: string;
  quantity?: number;
};

const POTION_DESCRIPTIONS: Record<string, string> = {
  item_minor_stamina_potion: "제작·작업 시 소모되는 피로도를 회복하는 소모품입니다.",
  item_lesser_recovery_potion: "던전 탐험 중 파티 HP를 회복합니다. (HP +10)",
  item_recovery_potion: "던전 탐험 중 파티 HP를 회복합니다. (HP 10% 회복)",
  item_greater_recovery_flask: "던전 탐험 중 파티 HP를 회복합니다. (HP 30% 회복)",
};

export function stackItemGradeIndex(it: StackItemTooltipData): number {
  return clampItemGrade(it.grade ?? 1);
}

export function stackItemGradeLabel(it: StackItemTooltipData): string {
  return it.gradeLabel ?? itemGradeLabel(it.grade ?? 1);
}

export function shouldShowStackItemTooltip(it: StackItemTooltipData): boolean {
  if (it.category === "물약") return true;
  if (isArmorInventoryItem(it)) return true;
  if (isMinionRecruitCategory(it.category) || isMinionRecruitItemId(it.itemId)) return true;
  if (isOptionConsumableItemId(it.itemId)) return true;
  return false;
}

export function stackItemTooltipSubtitle(it: StackItemTooltipData): string {
  if (it.category === "물약") return `물약 · ${stackItemGradeLabel(it)}`;
  if (isArmorInventoryItem(it)) {
    const stats = getArmorStats(it.itemId);
    const slot = stats ? armorSlotLabelKo(stats.slot) : "방어구";
    return `${slot} · ${stackItemGradeLabel(it)}`;
  }
  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    return `미니언 고용권 · ${stackItemGradeLabel(it)}`;
  }
  if (isOptionConsumableItemId(it.itemId)) return `장비 옵션 · ${stackItemGradeLabel(it)}`;
  return `${it.category} · ${stackItemGradeLabel(it)}`;
}

export function stackItemTooltipBodyLines(it: StackItemTooltipData): string[] {
  const lines: string[] = [];

  if (it.category === "물약") {
    const desc = POTION_DESCRIPTIONS[it.itemId] ?? "소모 시 효과가 적용되는 물약입니다.";
    lines.push(desc);
    return lines;
  }

  if (isArmorInventoryItem(it)) {
    const stats = getArmorStats(it.itemId);
    if (stats) {
      lines.push(`HP +${stats.hp} · DEF +${stats.def}`);
      lines.push("미니언 관리 → 장비 착용에서 슬롯에 장착할 수 있습니다.");
    } else {
      lines.push("미니언 장비로 착용할 수 있는 방어구입니다.");
    }
    return lines;
  }

  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    lines.push("미니언 후보 중 1명을 선택해 고용합니다. (고용권 1개 소모)");
    lines.push("사용 시 수집·전투 중 한 종류의 후보 직업이 무작위로 제시됩니다.");
    return lines;
  }

  if (it.itemId === "item_appraisal_scroll") {
    lines.push("미감정 무기·방어구의 옵션을 확인합니다.");
    lines.push("인벤토리 무기/방어구 탭에서 대상을 선택한 뒤 사용하세요.");
    return lines;
  }
  if (it.itemId === "item_gem_destruction") {
    lines.push("감정된 장비의 옵션 중 봉인되지 않은 1개를 무작위로 제거합니다.");
    return lines;
  }
  if (it.itemId === "item_gem_chaos") {
    lines.push("감정된 장비의 모든 옵션 종류를 변경합니다. 티어(T)는 유지됩니다.");
    lines.push("봉인된 옵션은 변경되지 않습니다.");
    return lines;
  }
  if (it.itemId === "item_gem_seal") {
    lines.push("감정된 장비의 옵션 중 1개를 봉인합니다. (장비당 최대 1개)");
    lines.push("봉인된 옵션은 소멸·혼돈의 영향을 받지 않습니다.");
    return lines;
  }

  return lines;
}
