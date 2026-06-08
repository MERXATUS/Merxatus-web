/**
 * 자동 탐험(AUTO_WAVES) — 배속 BM 스펙
 *
 * 원칙: 보상은 F2P·유료 동일, 차이는 **시간(배속)·일일 한도·연속 자동**만.
 * PUSH_LUCK(수동 층 진행)에는 미적용.
 */
export const AUTO_EXPLORE_RULES = {
  /** 적용 던전 모드 */
  dungeonMode: "AUTO_WAVES" as const,
  /** 무료 기본 배속 */
  baseSpeedMult: 1,
  /** 프리미엄 부스트 배속 (BM·패스) */
  premiumSpeedMult: 2,
  /** 보상 배율 — 배속과 무관하게 1.0 유지 */
  rewardMult: 1,
  /** 일일 자동 웨이브 상한 (무료) */
  dailyWaveCapFree: 120,
  /** 일일 자동 웨이브 상한 (프리미엄 활성) */
  dailyWaveCapPremium: 240,
  /** 이미 클리어한 스테이지만 자동 탐험 허용 */
  requireStageCleared: true,
  /** 프리미엄 부스트 기본 지속(시간) — 패스 상품용 */
  premiumBoostDurationHours: 24,
} as const;

export type AutoExploreSpeedTier = "free" | "premium";

/** 웨이브 간격(초)에 배속 적용 — 2배속이면 동일 시간에 2웨이브 처리 */
export function autoExploreWaveSeconds(baseWaveSeconds: number, speedMult: number): number {
  const mult = Math.max(1, Math.floor(speedMult));
  return Math.max(1, Math.floor(baseWaveSeconds / mult));
}

export function autoExploreSpeedMult(tier: AutoExploreSpeedTier): number {
  return tier === "premium"
    ? AUTO_EXPLORE_RULES.premiumSpeedMult
    : AUTO_EXPLORE_RULES.baseSpeedMult;
}

export function autoExploreDailyWaveCap(tier: AutoExploreSpeedTier): number {
  return tier === "premium"
    ? AUTO_EXPLORE_RULES.dailyWaveCapPremium
    : AUTO_EXPLORE_RULES.dailyWaveCapFree;
}
