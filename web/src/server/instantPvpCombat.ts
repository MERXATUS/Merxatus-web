import { computeWinRate } from "@/server/dungeonCombat";
import type { CombatantInput } from "@/server/dungeonBattler";
import { statsFromPower } from "@/server/dungeonBattler";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

/** PvP 1:1 — 전투력 비율 RNG + 짧은 연출 로그 */
export function resolvePvpInstant(input: {
  attacker: CombatantInput;
  defender: CombatantInput;
  rnd?: () => number;
}): {
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  log: CombatLogLine[];
  attackerHp: number;
  defenderHp: number;
} {
  const rnd = input.rnd ?? Math.random;
  const attacker = input.attacker;
  const defender = input.defender;
  const attackerMax = statsFromPower(attacker.power).maxHp + Math.max(0, Math.floor(attacker.bonusHp ?? 0));
  const defenderMax =
    statsFromPower(defender.power).maxHp + Math.max(0, Math.floor(defender.bonusHp ?? 0));

  const winRate = computeWinRate({
    partyPower: Math.max(1, Math.floor(attacker.power)),
    enemyPower: Math.max(1, Math.floor(defender.power)),
  });
  const attackerWins = rnd() < winRate;

  const log: CombatLogLine[] = [
    {
      t: "floor_start",
      floor: 1,
      enemyName: defender.label,
      enemyMaxHp: defenderMax,
    },
  ];

  if (attacker.activeSkillName) {
    log.push({ t: "skill", side: "party", actor: attacker.label, skillName: attacker.activeSkillName });
  }

  log.push({
    t: "hit",
    side: "party",
    actor: attacker.label,
    target: defender.label,
    damage: Math.max(1, Math.floor(defenderMax * (attackerWins ? 0.55 : 0.25))),
    kind: rnd() < 0.1 ? "crit" : "normal",
  });

  if (attackerWins) {
    log.push({ t: "ko", side: "enemy", name: defender.label });
    const attackerHp = Math.max(1, Math.floor(attackerMax * (0.35 + winRate * 0.45)));
    log.push({ t: "result", outcome: "WIN" });
    return { outcome: "ATTACKER_WIN", log, attackerHp, defenderHp: 0 };
  }

  log.push({
    t: "hit",
    side: "enemy",
    actor: defender.label,
    target: attacker.label,
    damage: attackerMax,
    kind: "normal",
  });
  log.push({ t: "ko", side: "party", name: attacker.label });
  log.push({ t: "result", outcome: "LOSS" });
  return { outcome: "DEFENDER_WIN", log, attackerHp: 0, defenderHp: Math.max(1, Math.floor(defenderMax * 0.4)) };
}
