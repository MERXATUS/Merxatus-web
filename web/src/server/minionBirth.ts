import type { MinionGrade, MinionJobType } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";

/** 인벤에서 소모 후 미니언 1마리 부화 */
export const MINION_EGG_ITEM_ID = "item_minion_egg";

const BIRTH_JOBS: MinionJobType[] = [
  "MINER",
  "FISHER",
  "LUMBERJACK",
  "HERBALIST",
  "BLACKSMITH",
  "JEWELER",
  "ALCHEMIST",
  "COOK",
  "SCRAPPER",
  "WARRIOR",
  "ARCHER",
  "MAGE",
];

function pickWeightedGrade(rnd: () => number): MinionGrade {
  const w = GAME_RULES.minion.gradeBirthWeights;
  const grades = ["S", "A", "B", "C", "D"] as const;
  const weights = grades.map((g) => Math.max(0, w[g]));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return "D";
  let r = rnd() * total;
  for (let i = 0; i < grades.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return grades[i]!;
  }
  return "D";
}

export function rollMinionJob(rnd: () => number = Math.random): MinionJobType {
  const i = Math.floor(rnd() * BIRTH_JOBS.length);
  return BIRTH_JOBS[Math.max(0, Math.min(BIRTH_JOBS.length - 1, i))]!;
}

export function rollMinionGrade(rnd: () => number = Math.random): MinionGrade {
  return pickWeightedGrade(rnd);
}

/** 신규 미니언 엔티티 (레벨 1 고정, 등급·직업 랜덤) */
export function randomMinionBirthRow(rnd: () => number = Math.random) {
  return {
    level: 1,
    grade: rollMinionGrade(rnd),
    jobType: rollMinionJob(rnd),
  };
}
