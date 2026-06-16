import { computeWinRate } from "@/server/dungeonCombat";
import type { CombatantInput, FloorEnemy, PartyHpSnapshot } from "@/server/dungeonBattler";
import { statsFromPower } from "@/server/dungeonBattler";
import {
  combatPowerFromMonster,
  fighterStatsFromMonster,
  scaleFighterStats,
  scaleFighterStatsByChannel,
} from "@/server/monsterCombat";
import type { DungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

function scaledEnemyStats(
  enemy: FloorEnemy,
  opts: { enemyStatMult?: number; enemyCombatMults?: DungeonEnemyCombatMults },
) {
  const base = fighterStatsFromMonster(enemy.monster);
  if (opts.enemyCombatMults) return scaleFighterStatsByChannel(base, opts.enemyCombatMults);
  const mult = Math.max(1, opts.enemyStatMult ?? 1);
  return mult > 1 ? scaleFighterStats(base, mult) : base;
}

function enemyPowerForInstant(
  enemy: FloorEnemy,
  opts: { enemyStatMult?: number; enemyCombatMults?: DungeonEnemyCombatMults },
) {
  const stats = scaledEnemyStats(enemy, opts);
  return combatPowerFromMonster({
    ...enemy.monster,
    hp: stats.maxHp,
    atk: stats.atkMin,
    magic: Math.max(0, stats.atkMax - stats.atkMin),
    def: stats.def,
  });
}

function partyHpSnapshots(
  party: CombatantInput[],
  partyHp?: Record<string, { hp: number; maxHp: number }>,
): PartyHpSnapshot[] {
  return party.map((p) => {
    const st = statsFromPower(p.power);
    const bonusHp = Math.max(0, Math.floor(p.bonusHp ?? 0));
    const maxHp = partyHp?.[p.id]?.maxHp ?? st.maxHp + bonusHp;
    const hp = Math.min(maxHp, Math.max(0, partyHp?.[p.id]?.hp ?? maxHp));
    return { minionId: p.id, hp, maxHp, label: p.label };
  });
}

/** PvE 층 전투 — 전투력 비율 RNG + 짧은 연출 로그 (턴 시뮬 대체) */
export function resolveFloorCombatInstant(input: {
  floor: number;
  party: CombatantInput[];
  enemy: FloorEnemy;
  partyHp?: Record<string, { hp: number; maxHp: number }>;
  partyPower?: number;
  partyDamageMult?: number;
  enemyStatMult?: number;
  enemyCombatMults?: DungeonEnemyCombatMults;
  rnd?: () => number;
}): { outcome: "WIN" | "LOSS"; log: CombatLogLine[]; partyHp: PartyHpSnapshot[] } {
  const rnd = input.rnd ?? Math.random;
  const enemyLabel = `[${input.enemy.name}]`;
  const enemyStats = scaledEnemyStats(input.enemy, {
    enemyStatMult: input.enemyStatMult,
    enemyCombatMults: input.enemyCombatMults,
  });

  const rawPartyPower =
    input.partyPower ?? input.party.reduce((sum, p) => sum + Math.max(0, Math.floor(p.power)), 0);
  const partyPower = Math.max(1, Math.floor(rawPartyPower * Math.max(1, input.partyDamageMult ?? 1)));
  const enemyPower = enemyPowerForInstant(input.enemy, {
    enemyStatMult: input.enemyStatMult,
    enemyCombatMults: input.enemyCombatMults,
  });

  const winRate = computeWinRate({ partyPower, enemyPower });
  const win = rnd() < winRate;

  let snapshots = partyHpSnapshots(input.party, input.partyHp);
  const log: CombatLogLine[] = [
    { t: "floor_start", floor: input.floor, enemyName: enemyLabel, enemyMaxHp: enemyStats.maxHp },
  ];

  const lead = input.party[0];
  if (lead?.activeSkillName) {
    log.push({ t: "skill", side: "party", actor: lead.label, skillName: lead.activeSkillName });
  }
  if (lead) {
    const dmg = Math.max(
      1,
      Math.floor(enemyStats.maxHp * (win ? 0.5 + rnd() * 0.4 : 0.15 + rnd() * 0.2)),
    );
    log.push({
      t: "hit",
      side: "party",
      actor: lead.label,
      target: enemyLabel,
      damage: dmg,
      kind: rnd() < 0.12 ? "crit" : "normal",
    });
  }

  if (win) {
    log.push({ t: "ko", side: "enemy", name: enemyLabel });
    const pressure = Math.max(0.06, Math.min(0.5, 1 - winRate + rnd() * 0.1));
    if (snapshots.length > 0 && pressure > 0.12) {
      const victim = snapshots[Math.floor(rnd() * snapshots.length)]!;
      const counter = Math.max(1, Math.floor(victim.maxHp * pressure * 0.45));
      log.push({
        t: "hit",
        side: "enemy",
        actor: enemyLabel,
        target: victim.label,
        damage: counter,
        kind: "normal",
      });
    }
    snapshots = snapshots.map((s) => {
      const loss = Math.floor(s.maxHp * pressure * (0.65 + rnd() * 0.5));
      return { ...s, hp: Math.max(1, s.hp - loss) };
    });
  } else {
    const victim = snapshots[0];
    if (victim) {
      log.push({
        t: "hit",
        side: "enemy",
        actor: enemyLabel,
        target: victim.label,
        damage: victim.hp,
        kind: "normal",
      });
      log.push({ t: "ko", side: "party", name: victim.label });
    }
    snapshots = snapshots.map((s) => ({ ...s, hp: 0 }));
  }

  log.push({ t: "result", outcome: win ? "WIN" : "LOSS" });
  return { outcome: win ? "WIN" : "LOSS", log, partyHp: snapshots };
}
