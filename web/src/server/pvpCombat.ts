import { applyDefense } from "@/server/monsterCombat";
import {
  emptyCombatModifiers,
  type EquipmentCombatModifiers,
} from "@/shared/equipmentCombatModifiers";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import {
  effectiveArmorPenPct,
  effectiveAtkSpdProcPct,
  effectiveBlockPct,
  effectiveCritChancePct,
  effectiveDmgReducePct,
  effectiveFinalDmgPct,
  lifeStealHealAmount,
} from "@/shared/combatUtilBalance";
import type { CombatantInput } from "@/server/dungeonBattler";
import { statsFromPower } from "@/server/dungeonBattler";
import { primarySkillActiveDamageMult } from "@/shared/minionSkills";

type Fighter = {
  id: string;
  label: string;
  logSide: "party" | "enemy";
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

function randInt(min: number, max: number, rnd: () => number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function combatantToFighter(c: CombatantInput, logSide: Fighter["logSide"]): Fighter {
  const st = statsFromPower(c.power);
  const bonusHp = Math.max(0, Math.floor(c.bonusHp ?? 0));
  const maxHp = st.maxHp + bonusHp;
  return {
    id: c.id,
    label: c.label,
    logSide,
    hp: maxHp,
    maxHp,
    atkMin: st.atkMin,
    atkMax: st.atkMax,
    def: Math.max(0, Math.floor(c.bonusDef ?? 0)),
    skillDamageMult: Math.max(1, c.skillDamageMult ?? 1),
    activeSkillName: c.activeSkillName?.trim() || null,
    activeSkillId: c.activeSkillId?.trim() || null,
    activeSkillLevel: Math.max(0, Math.floor(c.activeSkillLevel ?? 0)),
    combatMods: c.combatMods ?? emptyCombatModifiers(),
  };
}

function effectiveDef(def: number, armorPenPct: number) {
  const pen = Math.min(90, Math.max(0, armorPenPct));
  return Math.max(0, Math.floor(def * (1 - pen / 100)));
}

function resolvePvpHit(input: {
  attacker: Fighter;
  target: Fighter;
  rnd: () => number;
  hitKind?: "normal" | "extra";
  activeSkillHit?: boolean;
}): { damage: number; kind: "normal" | "crit" | "extra"; blocked: boolean } {
  const { attacker, target, rnd } = input;
  const hitKind = input.hitKind ?? "normal";

  const blockChance = effectiveBlockPct(target.combatMods.blockPct);
  if (blockChance > 0 && rnd() * 100 < blockChance) {
    return { damage: 0, kind: "normal", blocked: true };
  }

  let def = effectiveDef(target.def, effectiveArmorPenPct(attacker.combatMods.armorPenPct));
  let dmg = applyDefense(randInt(attacker.atkMin, attacker.atkMax, rnd), def);

  const mult = attacker.skillDamageMult;
  if (mult > 1) dmg = Math.max(1, Math.floor(dmg * mult));

  if (input.activeSkillHit && attacker.activeSkillId && attacker.activeSkillLevel > 0) {
    const skillHitMult = primarySkillActiveDamageMult(attacker.activeSkillId, attacker.activeSkillLevel);
    if (skillHitMult > 1) dmg = Math.max(1, Math.floor(dmg * skillHitMult));
  }

  if (attacker.combatMods.finalDmgPct > 0) {
    const finalPct = effectiveFinalDmgPct(attacker.combatMods.finalDmgPct);
    dmg = Math.max(1, Math.floor(dmg * (1 + finalPct / 100)));
  }

  const critChance = effectiveCritChancePct(attacker.combatMods.critChancePct);
  if (critChance > 0 && rnd() * 100 < critChance) {
    const critMult = 1 + Math.max(0, attacker.combatMods.critDmgPct) / 100;
    dmg = Math.max(1, Math.floor(dmg * critMult));
    return { damage: dmg, kind: hitKind === "extra" ? "extra" : "crit", blocked: false };
  }

  if (target.combatMods.dmgReducePct > 0) {
    const reduce = effectiveDmgReducePct(target.combatMods.dmgReducePct);
    dmg = Math.max(1, Math.floor(dmg * (1 - reduce / 100)));
  }

  return { damage: Math.max(0, dmg), kind: hitKind === "extra" ? "extra" : "normal", blocked: false };
}

function performPvpAttack(input: {
  attacker: Fighter;
  target: Fighter;
  rnd: () => number;
  log: CombatLogLine[];
  hitKind?: "normal" | "extra";
  activeSkillHit?: boolean;
}) {
  const hit = resolvePvpHit({
    attacker: input.attacker,
    target: input.target,
    rnd: input.rnd,
    hitKind: input.hitKind,
    activeSkillHit: input.activeSkillHit,
  });

  if (hit.blocked) {
    input.log.push({
      t: "block",
      side: input.target.logSide,
      actor: input.target.label,
      attacker: input.attacker.label,
    });
    return;
  }

  input.target.hp = Math.max(0, input.target.hp - hit.damage);
  input.log.push({
    t: "hit",
    side: input.attacker.logSide,
    actor: input.attacker.label,
    target: input.target.label,
    damage: hit.damage,
    kind: hit.kind,
  });

  const heal = lifeStealHealAmount(hit.damage, input.attacker.combatMods.lifeStealPct);
  if (heal > 0) {
    const before = input.attacker.hp;
    input.attacker.hp = Math.min(input.attacker.maxHp, input.attacker.hp + heal);
    const actual = input.attacker.hp - before;
    if (actual > 0) {
      input.log.push({
        t: "heal",
        side: input.attacker.logSide,
        actor: input.attacker.label,
        amount: actual,
      });
    }
  }

  if (input.target.hp <= 0) {
    input.log.push({ t: "ko", side: input.target.logSide, name: input.target.label });
  }
}

export function simulatePvpDuel(input: {
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
  const attacker = combatantToFighter(input.attacker, "party");
  const defender = combatantToFighter(input.defender, "enemy");

  const log: CombatLogLine[] = [
    {
      t: "floor_start",
      floor: 1,
      enemyName: defender.label,
      enemyMaxHp: defender.maxHp,
    },
  ];

  let round = 0;
  const maxRounds = 48;

  while (round < maxRounds && attacker.hp > 0 && defender.hp > 0) {
    round += 1;

    if (attacker.activeSkillName) {
      log.push({
        t: "skill",
        side: "party",
        actor: attacker.label,
        skillName: attacker.activeSkillName,
      });
    }
    performPvpAttack({ attacker, target: defender, rnd, log, activeSkillHit: !!attacker.activeSkillName });

    const extraChance = effectiveAtkSpdProcPct(attacker.combatMods.atkSpdPct);
    if (extraChance > 0 && defender.hp > 0 && rnd() * 100 < extraChance) {
      performPvpAttack({ attacker, target: defender, rnd, log, hitKind: "extra" });
    }

    if (defender.hp <= 0) break;

    if (defender.activeSkillName) {
      log.push({
        t: "skill",
        side: "enemy",
        actor: defender.label,
        skillName: defender.activeSkillName,
      });
    }
    performPvpAttack({
      attacker: defender,
      target: attacker,
      rnd,
      log,
      activeSkillHit: !!defender.activeSkillName,
    });

    const defExtra = effectiveAtkSpdProcPct(defender.combatMods.atkSpdPct);
    if (defExtra > 0 && attacker.hp > 0 && rnd() * 100 < defExtra) {
      performPvpAttack({ attacker: defender, target: attacker, rnd, log, hitKind: "extra" });
    }
  }

  const attackerWins = defender.hp <= 0 && attacker.hp > 0;
  const outcome = attackerWins ? "ATTACKER_WIN" : "DEFENDER_WIN";
  log.push({ t: "result", outcome: attackerWins ? "WIN" : "LOSS" });

  return {
    outcome,
    log,
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
  };
}
