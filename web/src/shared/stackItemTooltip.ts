import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";
import {
  isMinionRecruitCategory,
  isMinionRecruitItemId,
} from "@/shared/minionRecruit";

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
};

export function stackItemGradeIndex(it: StackItemTooltipData): number {
  return clampItemGrade(it.grade ?? 1);
}

export function stackItemGradeLabel(it: StackItemTooltipData): string {
  return it.gradeLabel ?? itemGradeLabel(it.grade ?? 1);
}

export function shouldShowStackItemTooltip(it: StackItemTooltipData): boolean {
  if (it.category === "물약") return true;
  if (isMinionRecruitCategory(it.category) || isMinionRecruitItemId(it.itemId)) return true;
  return false;
}

export function stackItemTooltipSubtitle(it: StackItemTooltipData): string {
  if (it.category === "물약") return `물약 · ${stackItemGradeLabel(it)}`;
  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    return `미니언 고용권 · ${stackItemGradeLabel(it)}`;
  }
  return `${it.category} · ${stackItemGradeLabel(it)}`;
}

export function stackItemTooltipBodyLines(it: StackItemTooltipData): string[] {
  const lines: string[] = [];

  if (it.category === "물약") {
    const desc = POTION_DESCRIPTIONS[it.itemId] ?? "소모 시 효과가 적용되는 물약입니다.";
    lines.push(desc);
    return lines;
  }

  if (isMinionRecruitItemId(it.itemId) || isMinionRecruitCategory(it.category)) {
    lines.push("미니언 후보 중 1명을 선택해 고용합니다. (고용권 1개 소모)");
    lines.push("사용 시 수집·전투 중 한 종류의 후보 직업이 무작위로 제시됩니다.");
    return lines;
  }

  return lines;
}
