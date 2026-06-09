import { computePartyPower } from "@/server/dungeonCombat";

import { partyStatsFromPower } from "@/shared/combatBalance";
import {
  applyDefense,
  fighterStatsFromMonster,
  scaleFighterStats,
  scaleFighterStatsByChannel,
} from "@/server/monsterCombat";
import type { DungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";

import type { MonsterDef } from "@/server/monsterData";

import type { CombatLogLine } from "@/shared/dungeonCombatLog";

import {

  emptyCombatModifiers,

  type EnemyCombatTags,

  type EquipmentCombatModifiers,

} from "@/shared/equipmentCombatModifiers";

import { primarySkillActiveDamageMult } from "@/shared/minionSkills";

import {
  effectiveArmorPenPct,
  effectiveAtkSpdProcPct,
  effectiveBlockPct,
  effectiveCritChancePct,
  effectiveCritResistPct,
  effectiveDmgReducePct,
  effectiveEvasionPct,
  effectiveFinalDmgPct,
  effectiveThornPct,
  effectiveVsTagBonusPct,
  lifeStealHealAmount,
} from "@/shared/combatUtilBalance";



export type { EnemyCombatTags };



export type CombatantInput = {

  id: string;

  label: string;

  power: number;

  bonusHp?: number;

  bonusDef?: number;

  /** 스킬 피해 배율 (기사단 배율과 곱) */

  skillDamageMult?: number;

  /** 전투 연출용 대표 스킬명 */

  activeSkillName?: string | null;

  activeSkillId?: string | null;

  activeSkillLevel?: number;

  combatMods?: EquipmentCombatModifiers;

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

  skillDamageMult: number;

  activeSkillName: string | null;

  activeSkillId: string | null;

  activeSkillLevel: number;

  combatMods: EquipmentCombatModifiers;

};



function randInt(min: number, max: number, rnd = Math.random) {

  const lo = Math.min(min, max);

  const hi = Math.max(min, max);

  return lo + Math.floor(rnd() * (hi - lo + 1));

}



export function statsFromPower(power: number) {
  return partyStatsFromPower(power);
}



export function buildPartyCombatants(

  members: Array<{

    minionId: string;

    combatClassLabel: string;

    power: number;

    bonusHp?: number;

    bonusDef?: number;

    skillDamageMult?: number;

    activeSkillName?: string | null;

    activeSkillId?: string | null;

    activeSkillLevel?: number;

    combatMods?: EquipmentCombatModifiers;

  }>,

): CombatantInput[] {

  const labelCount = new Map<string, number>();

  return members.map((m) => {

    const n = (labelCount.get(m.combatClassLabel) ?? 0) + 1;

    labelCount.set(m.combatClassLabel, n);

    return {

      id: m.minionId,

      label: `${m.combatClassLabel} ${n}`,

      power: m.power,

      bonusHp: m.bonusHp,

      bonusDef: m.bonusDef,

      skillDamageMult: m.skillDamageMult,

      activeSkillName: m.activeSkillName,

      activeSkillId: m.activeSkillId,

      activeSkillLevel: m.activeSkillLevel,

      combatMods: m.combatMods,

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



function effectiveDef(def: number, armorPenPct: number) {

  const pen = Math.min(90, Math.max(0, armorPenPct));

  return Math.max(0, Math.floor(def * (1 - pen / 100)));

}



function vsTagBonusPct(mods: EquipmentCombatModifiers, tags: EnemyCombatTags) {

  return effectiveVsTagBonusPct(mods, tags);

}



type HitKind = "normal" | "crit" | "extra";



function resolveHitDamage(input: {

  attacker: Fighter;

  target: Fighter;

  rnd: () => number;

  partyDamageMult?: number;

  attackerSkillDamageMult?: number;

  enemyTags?: EnemyCombatTags;

  activeSkillHit?: boolean;

}): { damage: number; kind: HitKind; blocked: boolean; evaded?: boolean } {

  const { attacker, target, rnd } = input;

  const partyDamageMult = Math.max(1, input.partyDamageMult ?? 1);

  const attackerSkillDamageMult = Math.max(1, input.attackerSkillDamageMult ?? 1);

  const enemyTags = input.enemyTags ?? { isBoss: false, isAngel: false, isDemon: false };



  if (target.side === "party") {
    const evasionChance = effectiveEvasionPct(target.combatMods.evasionPct);
    if (evasionChance > 0 && rnd() * 100 < evasionChance) {
      return { damage: 0, kind: "normal", blocked: false, evaded: true };
    }

    const blockChance = effectiveBlockPct(target.combatMods.blockPct);
    if (blockChance > 0 && rnd() * 100 < blockChance) {
      return { damage: 0, kind: "normal", blocked: true };
    }
  }



  let def = target.def;

  if (attacker.side === "party") {

    def = effectiveDef(def, effectiveArmorPenPct(attacker.combatMods.armorPenPct));

  }



  let dmg = applyDefense(rollDamage(attacker, rnd), def);



  if (attacker.side === "party") {

    const mult = partyDamageMult * attackerSkillDamageMult;

    if (mult > 1) dmg = Math.max(1, Math.floor(dmg * mult));

    if (input.activeSkillHit && attacker.activeSkillId && attacker.activeSkillLevel > 0) {
      const skillHitMult = primarySkillActiveDamageMult(attacker.activeSkillId, attacker.activeSkillLevel);
      if (skillHitMult > 1) dmg = Math.max(1, Math.floor(dmg * skillHitMult));
    }



    const vsBonus = vsTagBonusPct(attacker.combatMods, enemyTags);

    if (vsBonus > 0) dmg = Math.max(1, Math.floor(dmg * (1 + vsBonus / 100)));



    if (attacker.combatMods.finalDmgPct > 0) {

      const finalPct = effectiveFinalDmgPct(attacker.combatMods.finalDmgPct);

      dmg = Math.max(1, Math.floor(dmg * (1 + finalPct / 100)));

    }



    const critChance = effectiveCritChancePct(attacker.combatMods.critChancePct);

    if (critChance > 0 && rnd() * 100 < critChance) {
      const critMult = 1 + Math.max(0, attacker.combatMods.critDmgPct) / 100;
      dmg = Math.max(1, Math.floor(dmg * critMult));
      if (target.side === "party" && target.combatMods.critResistPct > 0) {
        const resist = effectiveCritResistPct(target.combatMods.critResistPct);
        dmg = Math.max(1, Math.floor(dmg * (1 - resist / 100)));
      }
      return { damage: dmg, kind: "crit", blocked: false };
    }

  }



  if (target.side === "party" && target.combatMods.dmgReducePct > 0) {

    const reduce = effectiveDmgReducePct(target.combatMods.dmgReducePct);

    dmg = Math.max(1, Math.floor(dmg * (1 - reduce / 100)));

  }



  return { damage: Math.max(0, dmg), kind: "normal", blocked: false };

}



function applyLifeSteal(attacker: Fighter, damage: number, log: CombatLogLine[]) {

  if (attacker.side !== "party" || damage <= 0) return;

  const heal = lifeStealHealAmount(damage, attacker.combatMods.lifeStealPct);

  if (heal <= 0) return;

  const before = attacker.hp;

  attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);

  const actual = attacker.hp - before;

  if (actual > 0) {

    log.push({ t: "heal", side: "party", actor: attacker.label, amount: actual });

  }

}



function performAttack(input: {

  attacker: Fighter;

  target: Fighter;

  rnd: () => number;

  log: CombatLogLine[];

  partyDamageMult: number;

  enemyTags: EnemyCombatTags;

  hitKind?: HitKind;

  activeSkillHit?: boolean;

}) {

  const { attacker, target, rnd, log, partyDamageMult, enemyTags } = input;

  const hitKind = input.hitKind ?? "normal";

  const hit = resolveHitDamage({

    attacker,

    target,

    rnd,

    partyDamageMult,

    attackerSkillDamageMult: attacker.skillDamageMult,

    enemyTags,

    activeSkillHit: input.activeSkillHit,

  });



  if (hit.evaded) {
    log.push({
      t: "evade",
      side: target.side,
      actor: target.label,
      attacker: attacker.label,
    });
    return;
  }

  if (hit.blocked) {
    log.push({
      t: "block",
      side: target.side,
      actor: target.label,
      attacker: attacker.label,
    });
    return;
  }

  target.hp = Math.max(0, target.hp - hit.damage);

  const kind = hitKind === "extra" ? "extra" : hit.kind;

  log.push({

    t: "hit",

    side: attacker.side,

    actor: attacker.label,

    target: target.label,

    damage: hit.damage,

    kind,

  });

  applyLifeSteal(attacker, hit.damage, log);

  if (
    attacker.side === "enemy" &&
    target.side === "party" &&
    hit.damage > 0 &&
    target.combatMods.thornPct > 0 &&
    attacker.hp > 0
  ) {
    const thornDmg = Math.max(
      1,
      Math.floor(hit.damage * (effectiveThornPct(target.combatMods.thornPct) / 100)),
    );
    attacker.hp = Math.max(0, attacker.hp - thornDmg);
    log.push({
      t: "hit",
      side: "party",
      actor: target.label,
      target: attacker.label,
      damage: thornDmg,
      kind: "extra",
    });
    if (attacker.hp <= 0) {
      log.push({ t: "ko", side: attacker.side, name: attacker.label });
    }
  }

  if (target.hp <= 0) {

    log.push({ t: "ko", side: target.side, name: target.label });

  }

}



/** 현재 층 전투 시뮬을 여러 번 돌려 클리어 확률 추정 (표시용) */

export type PartyHpSnapshot = { minionId: string; hp: number; maxHp: number; label: string };



export function estimateFloorWinChance(input: {

  floor: number;

  maxFloors: number;

  party: CombatantInput[];

  enemy: FloorEnemy;

  partyHp?: Record<string, { hp: number; maxHp: number }>;

  samples?: number;

  /** 기사단 최종/보스 데미지 배율 */

  partyDamageMult?: number;

  enemyTags?: EnemyCombatTags;

  enemyStatMult?: number;

  enemyCombatMults?: DungeonEnemyCombatMults;

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

      partyDamageMult: input.partyDamageMult,

      enemyTags: input.enemyTags,

      enemyStatMult: input.enemyStatMult,

      enemyCombatMults: input.enemyCombatMults,

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

  partyDamageMult?: number;

  enemyTags?: EnemyCombatTags;

  /** 레이드 등 — 몬스터 CSV 스탯 배율 (기본 1) */
  enemyStatMult?: number;
  /** 던전 — HP·공격·방어 채널별 배율 */
  enemyCombatMults?: DungeonEnemyCombatMults;

}): { outcome: "WIN" | "LOSS"; log: CombatLogLine[]; partyHp: PartyHpSnapshot[] } {

  const rnd = input.rnd ?? Math.random;

  const partyDamageMult = Math.max(1, input.partyDamageMult ?? 1);

  const enemyTags = input.enemyTags ?? { isBoss: false, isAngel: false, isDemon: false };

  const enemyLabel = `[${input.enemy.name}]`;

  const baseEnemyStats = fighterStatsFromMonster(input.enemy.monster);
  const enemyStats = input.enemyCombatMults
    ? scaleFighterStatsByChannel(baseEnemyStats, input.enemyCombatMults)
    : (() => {
        const enemyStatMult = Math.max(1, input.enemyStatMult ?? 1);
        return enemyStatMult > 1 ? scaleFighterStats(baseEnemyStats, enemyStatMult) : baseEnemyStats;
      })();

  const log: CombatLogLine[] = [

    { t: "floor_start", floor: input.floor, enemyName: enemyLabel, enemyMaxHp: enemyStats.maxHp },

  ];



  const partyFighters: Fighter[] = input.party.map((p) => {

    const st = statsFromPower(p.power);

    const saved = input.partyHp?.[p.id];

    const bonusHp = Math.max(0, Math.floor(p.bonusHp ?? 0));

    const maxHp = saved?.maxHp ?? st.maxHp + bonusHp;

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

      skillDamageMult: Math.max(1, p.skillDamageMult ?? 1),

      activeSkillName: p.activeSkillName?.trim() || null,

      activeSkillId: p.activeSkillId?.trim() || null,

      activeSkillLevel: Math.max(0, Math.floor(p.activeSkillLevel ?? 0)),

      combatMods: p.combatMods ?? emptyCombatModifiers(),

    };

  });



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

      skillDamageMult: 1,

      activeSkillName: null,

      activeSkillId: null,

      activeSkillLevel: 0,

      combatMods: emptyCombatModifiers(),

    },

  ];



  let round = 0;

  const maxRounds = 48;



  while (round < maxRounds) {

    round += 1;

    const aliveParty = pickAlive(partyFighters, "party");
    for (const fighter of aliveParty) {
      const regen = fighter.combatMods.regenHpPerRound;
      if (regen <= 0 || fighter.hp <= 0) continue;
      const before = fighter.hp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + regen);
      const actual = fighter.hp - before;
      if (actual > 0) {
        log.push({ t: "heal", side: "party", actor: fighter.label, amount: actual });
      }
    }

    const aliveEnemies = pickAlive(enemies, "enemy");

    if (aliveEnemies.length === 0) break;

    if (aliveParty.length === 0) break;



    for (const attacker of aliveParty) {

      const targets = pickAlive(enemies, "enemy");

      if (targets.length === 0) break;

      const target = targets[Math.floor(rnd() * targets.length)]!;

      if (attacker.activeSkillName) {

        log.push({

          t: "skill",

          side: "party",

          actor: attacker.label,

          skillName: attacker.activeSkillName,

        });

      }

      performAttack({

        attacker,

        target,

        rnd,

        log,

        partyDamageMult,

        enemyTags,

        activeSkillHit: !!attacker.activeSkillName,

      });



      const extraChance = effectiveAtkSpdProcPct(attacker.combatMods.atkSpdPct);

      if (extraChance > 0 && target.hp > 0 && rnd() * 100 < extraChance) {

        performAttack({

          attacker,

          target,

          rnd,

          log,

          partyDamageMult,

          enemyTags,

          hitKind: "extra",

        });

      }

    }



    const enemiesLeft = pickAlive(enemies, "enemy");

    if (enemiesLeft.length === 0) break;



    const enemy = enemiesLeft[0]!;

    const partyTargets = pickAlive(partyFighters, "party");

    if (partyTargets.length === 0) break;

    const victim = partyTargets[Math.floor(rnd() * partyTargets.length)]!;

    performAttack({

      attacker: enemy,

      target: victim,

      rnd,

      log,

      partyDamageMult: 1,

      enemyTags,

    });

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


