import type { MinionJobType } from "@prisma/client";
import { computePartyPower } from "@/server/dungeonCombat";
import { MINION_JOB_LABEL } from "@/server/minionJobs";
import { applyDefense, fighterStatsFromMonster } from "@/server/monsterCombat";
import type { MonsterDef } from "@/server/monsterData";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

export type CombatantInput = {
  id: string;
  label: string;
  power: number;
  bonusHp?: number;
  bonusDef?: number;
};

export type FloorEnemy = {
  name: string;
  monster: MonsterDef;
};

type Fighter = {
  id: string;
  label: string;
  side: "party" | "enemy";
  hp: number;
  maxHp: number;
  atkMin: number;
  atkMax: number;
  def: number;
};
function randInt(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function statsFromPower(power: number) {
  const p = Math.max(1, Math.floor(power));
  const maxHp = Math.max(24, Math.floor(p * 3.2));
  const baseAtk = Math.max(4, Math.floor(p * 0.35));
  return {
    maxHp,
    atkMin: baseAtk,
    atkMax: baseAtk + Math.max(2, Math.floor(p * 0.18)),
  };
}

export function buildPartyCombatants(
  members: Array<{ minionId: string; jobType: MinionJobType; power: number; bonusHp?: number; bonusDef?: number }>,
): CombatantInput[] {
  const jobCount = new Map<MinionJobType, number>();
  return members.map((m) => {
    const job = m.jobType;
    const n = (jobCount.get(job) ?? 0) + 1;
    jobCount.set(job, n);
    const jobLabel = MINION_JOB_LABEL[job] ?? job;
    return {
      id: m.minionId,
      label: `${jobLabel} ${n}`,
      power: m.power,
      bonusHp: m.bonusHp,
      bonusDef: m.bonusDef,
    };
  });
}

export function computeMemberPower(member: Parameters<typeof computePartyPower>[0]["members"][number]) {
  return computePartyPower({ members: [member] });
}

function pickAlive(fighters: Fighter[], side: Fighter["side"]) {
  return fighters.filter((f) => f.side === side && f.hp > 0);
}

function rollDamage(f: Fighter, rnd = Math.random) {
  return randInt(f.atkMin, f.atkMax, rnd);
}

function damageToTarget(attacker: Fighter, target: Fighter, rnd = Math.random) {
  return applyDefense(rollDamage(attacker, rnd), target.def);
}

/** 현재 층 전투 시뮬을 여러 번 돌려 클리어 확률 추정 (표시용) */export type PartyHpSnapshot = { minionId: string; hp: number; maxHp: number; label: string };

export function estimateFloorWinChance(input: {
  floor: number;
  maxFloors: number;
  party: CombatantInput[];
  enemy: FloorEnemy;
  partyHp?: Record<string, { hp: number; maxHp: number }>;
  samples?: number;
}): number {
  const n = Math.max(8, Math.min(200, Math.floor(input.samples ?? 48)));
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const battle = simulateFloorCombat({
      floor: input.floor,
      maxFloors: input.maxFloors,
      party: input.party,
      enemy: input.enemy,
      partyHp: input.partyHp,
    });
    if (battle.outcome === "WIN") wins += 1;
  }
  return wins / n;
}
export function buildFullPartyHp(party: CombatantInput[]): PartyHpSnapshot[] {
  return party.map((p) => {
    const st = statsFromPower(p.power);
    const maxHp = st.maxHp + Math.max(0, Math.floor(p.bonusHp ?? 0));
    return { minionId: p.id, hp: maxHp, maxHp, label: p.label };
  });
}

export function simulateFloorCombat(input: {
  floor: number;
  maxFloors: number;
  party: CombatantInput[];
  enemy: FloorEnemy;
  partyHp?: Record<string, { hp: number; maxHp: number }>;
  rnd?: () => number;
}): { outcome: "WIN" | "LOSS"; log: CombatLogLine[]; partyHp: PartyHpSnapshot[] } {
  const rnd = input.rnd ?? Math.random;
  const enemyLabel = `[${input.enemy.name}]`;
  const log: CombatLogLine[] = [{ t: "floor_start", floor: input.floor, enemyName: enemyLabel }];

  const partyFighters: Fighter[] = input.party.map((p) => {
    const st = statsFromPower(p.power);
    const saved = input.partyHp?.[p.id];
    const bonusHp = Math.max(0, Math.floor(p.bonusHp ?? 0));
    const maxHp = (saved?.maxHp ?? st.maxHp + bonusHp);
    const hp = Math.min(maxHp, Math.max(0, saved?.hp ?? maxHp));
    return {
      id: p.id,
      label: p.label,
      side: "party",
      hp,
      maxHp,
      atkMin: st.atkMin,
      atkMax: st.atkMax,
      def: Math.max(0, Math.floor(p.bonusDef ?? 0)),
    };
  });

  const enemyStats = fighterStatsFromMonster(input.enemy.monster);
  const enemies: Fighter[] = [
    {
      id: "enemy_0",
      label: enemyLabel,
      side: "enemy",
      hp: enemyStats.maxHp,
      maxHp: enemyStats.maxHp,
      atkMin: enemyStats.atkMin,
      atkMax: enemyStats.atkMax,
      def: enemyStats.def,
    },
  ];

  let round = 0;
  const maxRounds = 48;

  while (round < maxRounds) {
    round += 1;
    const aliveParty = pickAlive(partyFighters, "party");
    const aliveEnemies = pickAlive(enemies, "enemy");
    if (aliveEnemies.length === 0) break;
    if (aliveParty.length === 0) break;

    for (const attacker of aliveParty) {
      const targets = pickAlive(enemies, "enemy");
      if (targets.length === 0) break;
      const target = targets[Math.floor(rnd() * targets.length)]!;
      const dmg = damageToTarget(attacker, target, rnd);
      target.hp = Math.max(0, target.hp - dmg);
      log.push({ t: "hit", side: "party", actor: attacker.label, damage: dmg });
      if (target.hp <= 0) {
        log.push({ t: "ko", side: "enemy", name: target.label });
      }
    }

    const enemiesLeft = pickAlive(enemies, "enemy");
    if (enemiesLeft.length === 0) break;

    const enemy = enemiesLeft[0]!;
    const partyTargets = pickAlive(partyFighters, "party");
    if (partyTargets.length === 0) break;
    const victim = partyTargets[Math.floor(rnd() * partyTargets.length)]!;
    const dmg = damageToTarget(enemy, victim, rnd);
    victim.hp = Math.max(0, victim.hp - dmg);
    log.push({ t: "hit", side: "enemy", actor: enemy.label, damage: dmg });
    if (victim.hp <= 0) {
      log.push({ t: "ko", side: "party", name: victim.label });
    }
  }

  const win = pickAlive(enemies, "enemy").length === 0 && pickAlive(partyFighters, "party").length > 0;
  const outcome = win ? "WIN" : "LOSS";
  log.push({ t: "result", outcome });
  const partyHp = partyFighters.map((f) => ({
    minionId: f.id,
    hp: f.hp,
    maxHp: f.maxHp,
    label: f.label,
  }));
  return { outcome, log, partyHp };
}