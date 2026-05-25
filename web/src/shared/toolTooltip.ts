import { clampItemGrade, itemGradeLabel } from "@/server/itemGrade";

export type ToolTooltipOption = {
  kind: string;
  label: string;
  tier: number;
  tierLabel: string;
  displayValue: number;
};

export type ToolTooltipData = {
  id: string;
  baseItemId: string;
  name: string;
  grade?: number;
  gradeLabel?: string;
  options?: ToolTooltipOption[];
};

const TOOL_OPTION_KINDS = new Set(["WORK_SPEED", "RARITY_BONUS", "FATIGUE_REDUCTION"]);

export function toolDisplayName(t: ToolTooltipData): string {
  return t.name.trim() || t.baseItemId;
}

export function toolGradeLabel(t: ToolTooltipData): string {
  return t.gradeLabel ?? itemGradeLabel(t.grade ?? 1);
}

export function toolGradeIndex(t: ToolTooltipData): number {
  return clampItemGrade(t.grade ?? 1);
}

export function toolTooltipOptions(t: ToolTooltipData): ToolTooltipOption[] {
  return (t.options ?? []).filter((o) => TOOL_OPTION_KINDS.has(o.kind));
}
