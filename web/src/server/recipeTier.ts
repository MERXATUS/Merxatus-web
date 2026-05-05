/**
 * recipes.json / 시드 행에서 레시피에 필요한 최소 시설 티어(1~5)를 구합니다.
 * - `minTier` 필드가 있으면 우선 사용
 * - 없으면 이름의 `(T1)` … `(T5)` 패턴에서 추출 (대장간 레시피 등)
 */
export function recipeMinTierFromSeedRow(r: { name: string; minTier?: number }): number {
  if (typeof r.minTier === "number" && Number.isFinite(r.minTier)) {
    return Math.max(1, Math.min(5, Math.floor(r.minTier)));
  }
  const m = /\([Tt](\d)\)/.exec(r.name);
  if (m) {
    const n = parseInt(m[1] ?? "1", 10);
    return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
  }
  return 1;
}
