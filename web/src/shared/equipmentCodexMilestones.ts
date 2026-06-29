/** 도감 마일스톤 — 종류당 여러 단계 등록, 영구 버프 누적 */

export const CODEX_MILESTONE_BASE_ID = "base";

export type CodexMilestoneRequirements = {
  minEnhance?: number;
  minQuality?: number;
  minItemLevel?: number;
};

export type CodexMilestoneDef = {
  id: string;
  label: string;
  description: string;
  requirements: CodexMilestoneRequirements;
  /** 기본 도감 버프(베이스 스탯 6%) 대비 배율 — base는 1 */
  buffScale: number;
};

export const EQUIPMENT_CODEX_MILESTONES: CodexMilestoneDef[] = [
  { id: "base", label: "기본 등록", description: "종류 최초 등록", requirements: {}, buffScale: 1 },
  { id: "enhance_5", label: "제련 +5", description: "제련 +5 이상", requirements: { minEnhance: 5 }, buffScale: 0.1 },
  { id: "enhance_8", label: "제련 +8", description: "제련 +8 이상", requirements: { minEnhance: 8 }, buffScale: 0.14 },
  { id: "enhance_10", label: "제련 +10", description: "제련 +10 이상", requirements: { minEnhance: 10 }, buffScale: 0.18 },
  { id: "quality_3", label: "품질 3+", description: "품질 3 이상", requirements: { minQuality: 3 }, buffScale: 0.08 },
  { id: "quality_5", label: "품질 5+", description: "품질 5 이상", requirements: { minQuality: 5 }, buffScale: 0.1 },
  { id: "quality_8", label: "품질 8+", description: "품질 8 이상", requirements: { minQuality: 8 }, buffScale: 0.14 },
  { id: "quality_10", label: "품질 10", description: "품질 10 달성", requirements: { minQuality: 10 }, buffScale: 0.18 },
  { id: "item_level_50", label: "Lv50+", description: "아이템 레벨 50 이상", requirements: { minItemLevel: 50 }, buffScale: 0.08 },
  { id: "item_level_80", label: "Lv80+", description: "아이템 레벨 80 이상", requirements: { minItemLevel: 80 }, buffScale: 0.1 },
  { id: "item_level_100", label: "Lv100+", description: "아이템 레벨 100 이상", requirements: { minItemLevel: 100 }, buffScale: 0.14 },
  { id: "item_level_120", label: "Lv120+", description: "아이템 레벨 120 이상", requirements: { minItemLevel: 120 }, buffScale: 0.18 },
];

const MILESTONE_BY_ID = new Map(EQUIPMENT_CODEX_MILESTONES.map((m) => [m.id, m]));

export function codexMilestoneDef(milestoneId: string): CodexMilestoneDef | null {
  return MILESTONE_BY_ID.get(milestoneId.trim()) ?? null;
}

export function codexMilestoneIds(): string[] {
  return EQUIPMENT_CODEX_MILESTONES.map((m) => m.id);
}

export type CodexInstanceSnapshot = {
  enhanceLevel: number;
  quality: number;
  itemLevel: number;
};

export function instanceMeetsCodexMilestone(
  instance: CodexInstanceSnapshot,
  milestone: CodexMilestoneDef,
): boolean {
  const req = milestone.requirements;
  if (req.minEnhance != null && instance.enhanceLevel < req.minEnhance) return false;
  if (req.minQuality != null && instance.quality < req.minQuality) return false;
  if (req.minItemLevel != null && instance.itemLevel < req.minItemLevel) return false;
  return true;
}

export function scaleCodexBuffSlice<T extends Record<string, number>>(slice: T, scale: number): T {
  const s = Math.max(0, scale);
  const out = {} as T;
  for (const key of Object.keys(slice) as Array<keyof T>) {
    const v = slice[key];
    out[key] = Math.max(0, Math.floor(Number(v) * s)) as T[keyof T];
  }
  return out;
}
