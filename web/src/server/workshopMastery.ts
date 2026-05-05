import { GAME_RULES } from "@/server/gameRules";

export function masteryLevelFromXp(xp: number) {
  const safe = Math.max(0, Math.floor(xp || 0));
  // 간단 규칙: 100xp마다 레벨 +1 (Lv1 시작)
  return 1 + Math.floor(safe / 100);
}

export function effectiveTickSeconds(input: { baseTickSeconds: number; masteryLevel: number }) {
  const base = Math.max(1, Math.floor(input.baseTickSeconds));
  const level = Math.max(1, Math.floor(input.masteryLevel));
  const maxReduction = 0.5; // 최대 50% 단축
  const perLevel = 0.02; // 레벨당 2% 단축
  const reduction = Math.min(maxReduction, perLevel * Math.max(0, level - 1));
  const eff = Math.max(10, Math.round(base * (1 - reduction))); // 너무 빠르면 밸런스가 깨져서 하한 10초
  return eff;
}

export function workshopMasterySnapshot(xp: number) {
  const base = GAME_RULES.workshop.tickSeconds;
  const level = masteryLevelFromXp(xp);
  const tickSeconds = effectiveTickSeconds({ baseTickSeconds: base, masteryLevel: level });
  return { xp: Math.max(0, Math.floor(xp || 0)), level, tickSeconds, baseTickSeconds: base };
}

