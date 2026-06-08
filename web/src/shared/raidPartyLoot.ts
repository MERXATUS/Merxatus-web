/** 레이드 — 최대 인원 대비 적을수록 드랍 수량 증가 (3명→×1, 2명→×1.5, 1명→×3) */
export function raidPartyLootMultiplier(partySize: number, maxPartySize: number): number {
  const max = Math.max(1, Math.floor(maxPartySize));
  const size = Math.max(1, Math.min(max, Math.floor(partySize)));
  return max / size;
}

export function formatRaidPartyLootMultiplier(partySize: number, maxPartySize: number): string {
  const m = raidPartyLootMultiplier(partySize, maxPartySize);
  if (Math.abs(m - 1) < 0.001) return "×1";
  return Number.isInteger(m) ? `×${m}` : `×${m.toFixed(1)}`;
}
