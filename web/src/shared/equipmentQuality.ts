/** 장비 품질 — 품질 연마제로 최대 10회 상승, 품질 0~10 */
export const MAX_EQUIPMENT_QUALITY = 10;
export const MAX_QUALITY_CRAFT_USES = 10;

/** 품질 1당 전투력·스탯 배율 +2% */
export const QUALITY_POWER_PCT_PER_POINT = 2;

export function clampEquipmentQuality(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_EQUIPMENT_QUALITY, Math.floor(n)));
}

export function qualityPowerMultiplier(quality: number): number {
  const q = clampEquipmentQuality(quality);
  return 1 + (q * QUALITY_POWER_PCT_PER_POINT) / 100;
}

export function qualityLabel(quality: number): string {
  const q = clampEquipmentQuality(quality);
  if (q <= 0) return "품질 없음";
  return `품질 ${q}`;
}

export function canApplyQualityCraft(quality: number, qualityCraftCount: number): boolean {
  return (
    clampEquipmentQuality(quality) < MAX_EQUIPMENT_QUALITY &&
    Math.max(0, Math.floor(qualityCraftCount)) < MAX_QUALITY_CRAFT_USES
  );
}
