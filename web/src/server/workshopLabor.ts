import type { MinionJobType, SpecialistProfession } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import { getPreferredJobsForWorkshopName } from "@/server/minionJobs";
import { requiredSpecialistForProcessWorkshop } from "@/shared/specialistProfession";

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

export type ComputeWorkshopLaborOpts = {
  workshopKind?: "GATHER" | "PROCESS" | "CONSUME";
  specialistProfession?: SpecialistProfession | null;
};

export function computeWorkshopLabor(
  workshopName: string,
  assignmentJobTypes: MinionJobType[],
  opts?: ComputeWorkshopLaborOpts,
): WorkshopLaborMetrics {
  const { craftSpeedMultMin: lo, craftSpeedMultMax: hi } = GAME_RULES.workshopLabor;

  if (opts?.workshopKind === "PROCESS") {
    const req = requiredSpecialistForProcessWorkshop(workshopName);
    const prof = opts.specialistProfession ?? null;
    const match = req != null && prof != null && (prof as string) === req;

    if (match) {
      const totalAssigned = 3;
      const matchingCount = 3;
      const syn = synergyMultiplierFromMatchingCount(matchingCount);
      const bonusEach = GAME_RULES.workshopLabor.matchingBonusPerMinion;
      const laborScore = (totalAssigned + matchingCount * bonusEach) * syn;
      const base = Math.max(1, totalAssigned);
      const rawMult = laborScore / base;
      const craftSpeedMult = Math.min(hi, Math.max(lo, rawMult));
      return {
        workshopName,
        totalAssigned,
        matchingCount,
        synergyMult: syn,
        laborScore,
        craftSpeedMult,
        consumeOutputMult: craftSpeedMult,
      };
    }

    return {
      workshopName,
      totalAssigned: 0,
      matchingCount: 0,
      synergyMult: 1,
      laborScore: 0,
      craftSpeedMult: lo,
      consumeOutputMult: lo,
    };
  }

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
