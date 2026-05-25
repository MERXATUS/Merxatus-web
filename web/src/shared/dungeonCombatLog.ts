export type CombatLogLine =
  | { t: "floor_start"; floor: number; enemyName: string }
  | { t: "hit"; side: "party" | "enemy"; actor: string; damage: number }
  | { t: "ko"; side: "party" | "enemy"; name: string }
  | { t: "result"; outcome: "WIN" | "LOSS" };

/** 관전 로그 한 줄 텍스트 */
export function formatCombatLogLine(line: CombatLogLine): string {
  switch (line.t) {
    case "floor_start":
      return `— ${line.floor}층 · ${line.enemyName} —`;
    case "hit":
      if (line.side === "enemy") return `${line.actor} ${line.damage}의 데미지!`;
      return `${line.actor} ${line.damage}의 데미지!`;
    case "ko":
      return `${line.name} 처치!`;
    case "result":
      return line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸… 누적 보상 소멸";
    default:
      return "";
  }
}
