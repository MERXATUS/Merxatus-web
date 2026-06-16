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
  effectiveCritResistPct,
  effectiveDmgReducePct,
  effectiveEvasionPct,
  effectiveFinalDmgPct,
  effectiveThornPct,
  lifeStealHealAmount,
} from "@/shared/combatUtilBalance";
import type { CombatantInput } from "@/server/dungeonBattler";
import { statsFromPower } from "@/server/dungeonBattler";
import { primarySkillActiveDamageMult } from "@/shared/minionSkills";
import { skillCombatTriggers } from "@/shared/skillCombatTriggers";
import {
  applyActiveSkillExtras,
  applyCounterFromParry,
  applyPassiveOnAttack,
  applyPassiveOnDamagedStacks,
  atkStackDamageMult,
  emptySkillBattleState,
  logPassiveNegate,
  lowHpAtkBonusPct,
  resolveDamagedPassive,
  rollActiveSkillProc,
  tickSkillStateRoundEnd,
  type SkillBattleState,
} from "@/shared/skillCombatRuntime";

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
  passiveSkillId: string | null;
  passiveSkillLevel: number;
  passiveLowHpAtkMaxBonusPct: number;
  skillState: SkillBattleState;
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
    passiveSkillId: (c as any).passiveSkillId?.trim?.() ? (c as any).passiveSkillId.trim() : (c as any).passiveSkillId ?? null,
    passiveSkillLevel: Math.max(0, Math.floor((c as any).passiveSkillLevel ?? 0)),
    passiveLowHpAtkMaxBonusPct: Math.max(0, Math.floor((c as any).passiveLowHpAtkMaxBonusPct ?? 0)),
    skillState: emptySkillBattleState(),
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
  activeSkillDamageMult?: number;
  armorPenBonusPct?: number;
  lowHpAtkBonusPct?: number;
  critStackBonusPct?: number;
  damageScalePct?: number;
}): { damage: number; kind: "normal" | "crit" | "extra"; blocked: boolean; evaded?: boolean } {
  const { attacker, target, rnd } = input;
  const hitKind = input.hitKind ?? "normal";

  const evasionChance = effectiveEvasionPct(target.combatMods.evasionPct);
  if (evasionChance > 0 && rnd() * 100 < evasionChance) {
    return { damage: 0, kind: hitKind === "extra" ? "extra" : "normal", blocked: false, evaded: true };
  }

  const blockChance = effectiveBlockPct(target.combatMods.blockPct);
  if (blockChance > 0 && rnd() * 100 < blockChance) {
    return { damage: 0, kind: "normal", blocked: true };
  }

  let def = effectiveDef(
    target.def,
    effectiveArmorPenPct(attacker.combatMods.armorPenPct + (input.armorPenBonusPct ?? 0)),
  );
  let dmg = applyDefense(randInt(attacker.atkMin, attacker.atkMax, rnd), def);

  const mult = attacker.skillDamageMult;
  if (mult > 1) dmg = Math.max(1, Math.floor(dmg * mult));

  if (input.activeSkillHit && attacker.activeSkillId && attacker.activeSkillLevel > 0) {
    const skillHitMult =
      input.activeSkillDamageMult ?? primarySkillActiveDamageMult(attacker.activeSkillId, attacker.activeSkillLevel);
    if (skillHitMult > 1) dmg = Math.max(1, Math.floor(dmg * skillHitMult));
  }
  const lowHpBonus = input.lowHpAtkBonusPct ?? 0;
  if (lowHpBonus > 0) dmg = Math.max(1, Math.floor(dmg * (1 + lowHpBonus / 100)));

  if (attacker.combatMods.finalDmgPct > 0) {
    const finalPct = effectiveFinalDmgPct(attacker.combatMods.finalDmgPct);
    dmg = Math.max(1, Math.floor(dmg * (1 + finalPct / 100)));
  }

  const critChance = effectiveCritChancePct(attacker.combatMods.critChancePct + (input.critStackBonusPct ?? 0));
  if (critChance > 0 && rnd() * 100 < critChance) {
    const critMult = 1 + Math.max(0, attacker.combatMods.critDmgPct) / 100;
    dmg = Math.max(1, Math.floor(dmg * critMult));
    if (target.combatMods.critResistPct > 0) {
      const resist = effectiveCritResistPct(target.combatMods.critResistPct);
      dmg = Math.max(1, Math.floor(dmg * (1 - resist / 100)));
    }
    return { damage: dmg, kind: hitKind === "extra" ? "extra" : "crit", blocked: false };
  }

  if (target.combatMods.dmgReducePct > 0) {
    const reduce = effectiveDmgReducePct(target.combatMods.dmgReducePct);
    dmg = Math.max(1, Math.floor(dmg * (1 - reduce / 100)));
  }

  if (input.damageScalePct != null && input.damageScalePct > 0 && input.damageScalePct !== 100) {
    dmg = Math.max(1, Math.floor((dmg * input.damageScalePct) / 100));
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
  activeSkillDamageMult?: number;
  armorPenBonusPct?: number;
  lowHpAtkBonusPct?: number;
  critStackBonusPct?: number;
  damageScalePct?: number;
}) {
  const hit = resolvePvpHit({
    attacker: input.attacker,
    target: input.target,
    rnd: input.rnd,
    hitKind: input.hitKind,
    activeSkillHit: input.activeSkillHit,
    activeSkillDamageMult: input.activeSkillDamageMult,
    armorPenBonusPct: input.armorPenBonusPct,
    lowHpAtkBonusPct: input.lowHpAtkBonusPct,
    critStackBonusPct: input.critStackBonusPct,
    damageScalePct: input.damageScalePct,
  });

  if (hit.evaded) {
    input.log.push({
      t: "evade",
      side: input.target.logSide,
      actor: input.target.label,
      attacker: input.attacker.label,
    });
    return;
  }

  if (hit.blocked) {
    input.log.push({
      t: "block",
      side: input.target.logSide,
      actor: input.target.label,
      attacker: input.attacker.label,
    });
    return;
  }

  if (hit.damage > 0) {
    const passive = resolveDamagedPassive(
      {
        label: input.target.label,
        side: input.target.logSide,
        id: input.target.id,
        hp: input.target.hp,
        maxHp: input.target.maxHp,
        atkMin: input.target.atkMin,
        atkMax: input.target.atkMax,
        def: input.target.def,
        passiveSkillId: input.target.passiveSkillId,
        passiveSkillLevel: input.target.passiveSkillLevel,
        activeSkillId: input.target.activeSkillId,
        activeSkillLevel: input.target.activeSkillLevel,
        skillState: input.target.skillState,
        statuses: [],
        combatMods: input.target.combatMods,
      },
      { label: input.attacker.label, side: input.attacker.logSide, hp: input.attacker.hp },
      hit.damage,
      input.rnd,
    );
    applyPassiveOnDamagedStacks({
      label: input.target.label,
      side: input.target.logSide,
      id: input.target.id,
      hp: input.target.hp,
      maxHp: input.target.maxHp,
      atkMin: input.target.atkMin,
      atkMax: input.target.atkMax,
      def: input.target.def,
      passiveSkillId: input.target.passiveSkillId,
      passiveSkillLevel: input.target.passiveSkillLevel,
      activeSkillId: input.target.activeSkillId,
      activeSkillLevel: input.target.activeSkillLevel,
      skillState: input.target.skillState,
      statuses: [],
      combatMods: input.target.combatMods,
    });
    if (passive.handled) {
      logPassiveNegate(
        input.log,
        {
          label: input.target.label,
          side: input.target.logSide,
          id: input.target.id,
          hp: input.target.hp,
          maxHp: input.target.maxHp,
          atkMin: input.target.atkMin,
          atkMax: input.target.atkMax,
          def: input.target.def,
          passiveSkillId: input.target.passiveSkillId,
          passiveSkillLevel: input.target.passiveSkillLevel,
          activeSkillId: input.target.activeSkillId,
          activeSkillLevel: input.target.activeSkillLevel,
          skillState: input.target.skillState,
          statuses: [],
          combatMods: input.target.combatMods,
        },
        input.attacker.label,
        passive,
      );
      if (passive.counterDamage) {
        applyCounterFromParry(
          {
            label: input.target.label,
            side: input.target.logSide,
            id: input.target.id,
            hp: input.target.hp,
            maxHp: input.target.maxHp,
            atkMin: input.target.atkMin,
            atkMax: input.target.atkMax,
            def: input.target.def,
            passiveSkillId: input.target.passiveSkillId,
            passiveSkillLevel: input.target.passiveSkillLevel,
            activeSkillId: input.target.activeSkillId,
            activeSkillLevel: input.target.activeSkillLevel,
            skillState: input.target.skillState,
            statuses: [],
            combatMods: input.target.combatMods,
          },
          {
            label: input.attacker.label,
            side: input.attacker.logSide,
            id: input.attacker.id,
            hp: input.attacker.hp,
            maxHp: input.attacker.maxHp,
            atkMin: input.attacker.atkMin,
            atkMax: input.attacker.atkMax,
            def: input.attacker.def,
            passiveSkillId: input.attacker.passiveSkillId,
            passiveSkillLevel: input.attacker.passiveSkillLevel,
            activeSkillId: input.attacker.activeSkillId,
            activeSkillLevel: input.attacker.activeSkillLevel,
            skillState: input.attacker.skillState,
            statuses: [],
            combatMods: input.attacker.combatMods,
          },
          passive.counterDamage,
          input.log,
        );
      }
      return;
    }
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

  if (
    hit.damage > 0 &&
    input.target.combatMods.thornPct > 0 &&
    input.attacker.hp > 0
  ) {
    const thornDmg = Math.max(
      1,
      Math.floor(hit.damage * (effectiveThornPct(input.target.combatMods.thornPct) / 100)),
    );
    input.attacker.hp = Math.max(0, input.attacker.hp - thornDmg);
    input.log.push({
      t: "hit",
      side: input.target.logSide,
      actor: input.target.label,
      target: input.attacker.label,
      damage: thornDmg,
      kind: "extra",
    });
    if (input.attacker.hp <= 0) {
      input.log.push({ t: "ko", side: input.attacker.logSide, name: input.attacker.label });
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

    for (const fighter of [attacker, defender]) {
      const regen = fighter.combatMods.regenHpPerRound;
      if (regen <= 0 || fighter.hp <= 0) continue;
      const before = fighter.hp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + regen);
      const actual = fighter.hp - before;
      if (actual > 0) {
        log.push({ t: "heal", side: fighter.logSide, actor: fighter.label, amount: actual });
      }
    }

    const attackerProc = rollActiveSkillProc(attacker.activeSkillId, attacker.activeSkillLevel, rnd);
    const attackerPassive = applyPassiveOnAttack(attacker as any, rnd, log);
    let atkStackMult = 1;
    if (attacker.passiveSkillId && attacker.passiveSkillLevel > 0) {
      const stackSpec = (skillCombatTriggers(attacker.passiveSkillId)?.onAttack ?? []).find((s) => s.trigger === "stack_atk");
      if (stackSpec && attacker.skillState.atkStacks > 0) {
        const bonusPer =
          (stackSpec.stackBonusPct ?? 4) +
          (stackSpec.stackBonusPctPerLevel ?? 0) * Math.max(0, attacker.passiveSkillLevel - 1);
        atkStackMult = atkStackDamageMult(attacker.skillState.atkStacks, bonusPer);
      }
    }
    const attackerLowHp = lowHpAtkBonusPct({ hp: attacker.hp, maxHp: attacker.maxHp }, attacker.passiveLowHpAtkMaxBonusPct);
    const attackerCritStack = attacker.skillState.critStacks * 2;

    if (attackerProc.proc && attacker.activeSkillName) {
      log.push({ t: "skill", side: "party", actor: attacker.label, skillName: attacker.activeSkillName });
    }
    const saved = attacker.skillDamageMult;
    attacker.skillDamageMult *= atkStackMult;
    performPvpAttack({
      attacker,
      target: defender,
      rnd,
      log,
      activeSkillHit: attackerProc.proc,
      activeSkillDamageMult: attackerProc.proc ? attackerProc.damageMult : undefined,
      armorPenBonusPct: attackerProc.armorPenPct,
      lowHpAtkBonusPct: attackerLowHp,
      critStackBonusPct: attackerCritStack,
    });
    attacker.skillDamageMult = saved;
    if (attackerProc.proc && defender.hp > 0) {
      applyActiveSkillExtras({
        attacker: attacker as any,
        target: defender as any,
        activeSkillId: attacker.activeSkillId,
        activeSkillLevel: attacker.activeSkillLevel,
        proc: true,
        log,
        rnd,
      });
    }
    if (attackerPassive.extraHit && defender.hp > 0) {
      performPvpAttack({
        attacker,
        target: defender,
        rnd,
        log,
        hitKind: "extra",
        damageScalePct: attackerPassive.extraHitDamagePct,
        lowHpAtkBonusPct: attackerLowHp,
        critStackBonusPct: attackerCritStack,
      });
    }

    const extraChance = effectiveAtkSpdProcPct(attacker.combatMods.atkSpdPct);
    if (extraChance > 0 && defender.hp > 0 && rnd() * 100 < extraChance) {
      performPvpAttack({ attacker, target: defender, rnd, log, hitKind: "extra" });
    }

    if (defender.hp <= 0) break;

    const defenderProc = rollActiveSkillProc(defender.activeSkillId, defender.activeSkillLevel, rnd);
    const defenderPassive = applyPassiveOnAttack(defender as any, rnd, log);
    let defAtkStackMult = 1;
    if (defender.passiveSkillId && defender.passiveSkillLevel > 0) {
      const stackSpec = (skillCombatTriggers(defender.passiveSkillId)?.onAttack ?? []).find((s) => s.trigger === "stack_atk");
      if (stackSpec && defender.skillState.atkStacks > 0) {
        const bonusPer =
          (stackSpec.stackBonusPct ?? 4) +
          (stackSpec.stackBonusPctPerLevel ?? 0) * Math.max(0, defender.passiveSkillLevel - 1);
        defAtkStackMult = atkStackDamageMult(defender.skillState.atkStacks, bonusPer);
      }
    }
    const defenderLowHp = lowHpAtkBonusPct({ hp: defender.hp, maxHp: defender.maxHp }, defender.passiveLowHpAtkMaxBonusPct);
    const defenderCritStack = defender.skillState.critStacks * 2;

    if (defenderProc.proc && defender.activeSkillName) {
      log.push({
        t: "skill",
        side: "enemy",
        actor: defender.label,
        skillName: defender.activeSkillName,
      });
    }
    const savedDef = defender.skillDamageMult;
    defender.skillDamageMult *= defAtkStackMult;
    performPvpAttack({
      attacker: defender,
      target: attacker,
      rnd,
      log,
      activeSkillHit: defenderProc.proc,
      activeSkillDamageMult: defenderProc.proc ? defenderProc.damageMult : undefined,
      armorPenBonusPct: defenderProc.armorPenPct,
      lowHpAtkBonusPct: defenderLowHp,
      critStackBonusPct: defenderCritStack,
    });
    defender.skillDamageMult = savedDef;
    if (defenderProc.proc && attacker.hp > 0) {
      applyActiveSkillExtras({
        attacker: defender as any,
        target: attacker as any,
        activeSkillId: defender.activeSkillId,
        activeSkillLevel: defender.activeSkillLevel,
        proc: true,
        log,
        rnd,
      });
    }
    if (defenderPassive.extraHit && attacker.hp > 0) {
      performPvpAttack({
        attacker: defender,
        target: attacker,
        rnd,
        log,
        hitKind: "extra",
        damageScalePct: defenderPassive.extraHitDamagePct,
        lowHpAtkBonusPct: defenderLowHp,
        critStackBonusPct: defenderCritStack,
      });
    }

    const defExtra = effectiveAtkSpdProcPct(defender.combatMods.atkSpdPct);
    if (defExtra > 0 && attacker.hp > 0 && rnd() * 100 < defExtra) {
      performPvpAttack({ attacker: defender, target: attacker, rnd, log, hitKind: "extra" });
    }

    tickSkillStateRoundEnd(attacker.skillState);
    tickSkillStateRoundEnd(defender.skillState);
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
