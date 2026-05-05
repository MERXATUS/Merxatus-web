import type { MinionJobType } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import { getPreferredJobsForWorkshopName } from "@/server/minionJobs";

/** 특화 직업 n명일 때 시너지 배수 (누적 곱) */
export function synergyMultiplierFromMatchingCount(matchingCount: number): number {
  const w = GAME_RULES.workshopLabor;
  let m = 1;
  if (matchingCount >= 3) m *= w.synergyMultAt3;
  if (matchingCount >= 5) m *= w.synergyMultAt5;
  if (matchingCount >= 7) m *= w.synergyMultAt7;
  if (matchingCount >= 10) m *= w.synergyMultAt10;
  return m;
}

export type WorkshopLaborMetrics = {
  workshopName: string;
  totalAssigned: number;
  matchingCount: number;
  synergyMult: number;
  /** 수집 롤 등에 쓰는 가동력 */
  laborScore: number;
  /** 가공 제작 시간 역수에 사용 (클수록 빠름) */
  craftSpeedMult: number;
  /** 2차 소모 산출·골드 배수 */
  consumeOutputMult: number;
};

export function computeWorkshopLabor(workshopName: string, assignmentJobTypes: MinionJobType[]): WorkshopLaborMetrics {
  const preferred = getPreferredJobsForWorkshopName(workshopName);
  const totalAssigned = assignmentJobTypes.length;
  const matchingCount =
    preferred.length === 0
      ? 0
      : assignmentJobTypes.filter((j) => preferred.includes(j as MinionJobType)).length;

  const syn = synergyMultiplierFromMatchingCount(matchingCount);
  const bonusEach = GAME_RULES.workshopLabor.matchingBonusPerMinion;
  const laborScore = (totalAssigned + matchingCount * bonusEach) * syn;

  const base = Math.max(1, totalAssigned);
  const rawMult = laborScore / base;
  const { craftSpeedMultMin: lo, craftSpeedMultMax: hi } = GAME_RULES.workshopLabor;
  const craftSpeedMult = Math.min(hi, Math.max(lo, rawMult));
  const consumeOutputMult = craftSpeedMult;

  return {
    workshopName,
    totalAssigned,
    matchingCount,
    synergyMult: syn,
    laborScore,
    craftSpeedMult,
    consumeOutputMult,
  };
}
