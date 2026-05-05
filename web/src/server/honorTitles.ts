export function honorTitleForPoints(points: number): string | null {
  const p = Math.max(0, Math.floor(points));
  if (p >= 300_000) return "황실_최고훈장";
  if (p >= 150_000) return "황실_훈장";
  if (p >= 50_000) return "황실_공로자";
  return null;
}

