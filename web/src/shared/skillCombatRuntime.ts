import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import {
  scaleChancePct,
  scaleDamageMult,
  scaleOnActiveHitSpecs,
  scalePassiveMods,
  skillCombatTriggers,
  skillNameById,
  type SkillTriggerSpec,
} from "@/shared/skillCombatTriggers";
import type { CombatStatusInstance } from "@/shared/combatStatus";
import { rollStatusApplications } from "@/shared/combatStatus";
import { counterHitLog } from "@/shared/combatStatus";

export type SkillBattleState = {
  atkStacks: number;
  critStacks: number;
  summonedSwords: number;
  swordKinds: Array<"fire" | "ice" | "shock" | "arcane">;
  divineAegisIcd: number;
};

export function emptySkillBattleState(): SkillBattleState {
  return { atkStacks: 0, critStacks: 0, summonedSwords: 0, swordKinds: [], divineAegisIcd: 0 };
}

export type SkillCombatFighter = {
  label: string;
  side: "party" | "enemy";
  id: string;
  hp: number;
  maxHp: number;
  atkMin: number;
  atkMax: number;
  def: number;
  passiveSkillId: string | null;
  passiveSkillLevel: number;
  activeSkillId: string | null;
  activeSkillLevel: number;
  skillState: SkillBattleState;
  statuses?: CombatStatusInstance[];
  combatMods: {
    critChancePct: number;
    lifeStealPct: number;
    dmgReducePct: number;
  };
};

function rndHit(attacker: SkillCombatFighter, rnd: () => number): number {
  const lo = Math.min(attacker.atkMin, attacker.atkMax);
  const hi = Math.max(attacker.atkMin, attacker.atkMax);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function applyDefense(raw: number, def: number): number {
  const reduction = def / (def + 100);
  return Math.max(1, Math.floor(raw * (1 - reduction)));
}

export function passiveModsForSkill(skillId: string | null, skillLevel: number) {
  if (!skillId || skillLevel <= 0) return scalePassiveMods(undefined, 0);
  return scalePassiveMods(skillCombatTriggers(skillId)?.passiveMods, skillLevel);
}

export function lowHpAtkBonusPct(
  fighter: Pick<SkillCombatFighter, "hp" | "maxHp">,
  maxBonusPct: number,
): number {
  if (maxBonusPct <= 0 || fighter.maxHp <= 0) return 0;
  const missingRatio = 1 - fighter.hp / fighter.maxHp;
  return Math.floor(maxBonusPct * Math.max(0, Math.min(1, missingRatio)));
}

export function atkStackDamageMult(stacks: number, bonusPctPerStack: number): number {
  if (stacks <= 0 || bonusPctPerStack <= 0) return 1;
  return 1 + (stacks * bonusPctPerStack) / 100;
}

export function rollActiveSkillProc(
  activeSkillId: string | null,
  activeSkillLevel: number,
  rnd: () => number,
): { proc: boolean; damageMult: number; armorPenPct: number; spec: SkillTriggerSpec | null } {
  if (!activeSkillId || activeSkillLevel <= 0) {
    return { proc: false, damageMult: 1, armorPenPct: 0, spec: null };
  }
  const triggers = skillCombatTriggers(activeSkillId);
  const specs = triggers?.onAttack ?? [];
  const primary =
    specs.find((s) => s.trigger === "proc_skill_hit" || s.trigger === "always_skill_hit") ??
    specs.find((s) => s.trigger === "armor_pen_strike") ??
    specs.find((s) => s.trigger === "inverse_hp_damage") ??
    specs[0] ??
    null;
  if (!primary) return { proc: false, damageMult: 1, armorPenPct: 0, spec: null };

  const chance = scaleChancePct(primary, activeSkillLevel);
  const proc = chance >= 100 || rnd() * 100 < chance;
  return {
    proc,
    damageMult: proc ? scaleDamageMult(primary, activeSkillLevel) : 1,
    armorPenPct: proc && primary.trigger === "armor_pen_strike" ? primary.armorPenPct ?? 0 : 0,
    spec: proc ? primary : null,
  };
}

export type DamagedPassiveResult =
  | { handled: false }
  | { handled: true; negate: true; kind: "parry" | "evade" | "nullify"; counterDamage?: number };

export function resolveDamagedPassive(
  defender: SkillCombatFighter,
  attacker: Pick<SkillCombatFighter, "label" | "side" | "hp">,
  incomingDamage: number,
  rnd: () => number,
): DamagedPassiveResult {
  if (incomingDamage <= 0 || !defender.passiveSkillId || defender.passiveSkillLevel <= 0) {
    return { handled: false };
  }
  const specs = skillCombatTriggers(defender.passiveSkillId)?.onDamaged ?? [];
  for (const spec of specs) {
    if (spec.trigger === "nullify" && defender.skillState.divineAegisIcd > 0) continue;
    const chance = scaleChancePct(spec, defender.passiveSkillLevel);
    if (chance <= 0 || rnd() * 100 >= chance) continue;

    if (spec.trigger === "parry") {
      const counterBase = spec.counterDamagePct ?? 80;
      const counterPer = spec.counterDamagePctPerLevel ?? 0;
      const counterPct = counterBase + counterPer * Math.max(0, defender.passiveSkillLevel - 1);
      const counterDamage = Math.max(1, Math.floor((incomingDamage * counterPct) / 100));
      return { handled: true, negate: true, kind: "parry", counterDamage };
    }
    if (spec.trigger === "evade") {
      return { handled: true, negate: true, kind: "evade" };
    }
    if (spec.trigger === "nullify") {
      defender.skillState.divineAegisIcd = Math.max(0, spec.icdTurns ?? 3);
      return { handled: true, negate: true, kind: "nullify" };
    }
  }
  return { handled: false };
}

export function tickSkillStateRoundEnd(state: SkillBattleState): void {
  if (state.divineAegisIcd > 0) state.divineAegisIcd -= 1;
}

const SWORD_KIND_LABEL: Record<"fire" | "ice" | "shock" | "arcane", string> = {
  fire: "화염",
  ice: "빙결",
  shock: "전격",
  arcane: "마력",
};

export function applyPassiveOnAttack(
  attacker: SkillCombatFighter,
  rnd: () => number,
  log?: CombatLogLine[],
): { extraHit: boolean; extraHitDamagePct: number } {
  let extraHit = false;
  let extraHitDamagePct = 75;
  if (!attacker.passiveSkillId || attacker.passiveSkillLevel <= 0) {
    return { extraHit, extraHitDamagePct };
  }
  const specs = skillCombatTriggers(attacker.passiveSkillId)?.onAttack ?? [];
  for (const spec of specs) {
    if (spec.trigger === "stack_atk") {
      const max = spec.maxStacks ?? 6;
      const bonus = spec.stackBonusPct ?? 4;
      if (attacker.skillState.atkStacks < max) attacker.skillState.atkStacks += 1;
      void bonus;
    }
    if (spec.trigger === "stack_crit") {
      const max = spec.maxStacks ?? 10;
      if (attacker.skillState.critStacks < max) attacker.skillState.critStacks += 1;
    }
    if (spec.trigger === "summon_sword") {
      const chance = scaleChancePct(spec, attacker.passiveSkillLevel);
      if (chance > 0 && rnd() * 100 < chance) {
        const maxSwords = Math.floor((spec.maxSwords ?? 4) + (spec.maxSwordsPerLevel ?? 0) * Math.max(0, attacker.passiveSkillLevel - 1));
        if (attacker.skillState.summonedSwords < maxSwords) {
          const kinds: Array<"fire" | "ice" | "shock" | "arcane"> = ["fire", "ice", "shock", "arcane"];
          const pick = kinds[Math.floor(rnd() * kinds.length)]!;
          attacker.skillState.summonedSwords += 1;
          attacker.skillState.swordKinds.push(pick);
          if (log) {
            log.push({
              t: "buff",
              side: attacker.side,
              actor: attacker.label,
              text: `${SWORD_KIND_LABEL[pick]}검 (${attacker.skillState.summonedSwords}/${maxSwords})`,
              skillName: skillNameById(attacker.passiveSkillId) ?? undefined,
            });
          }
        }
      }
    }
    if (spec.trigger === "proc_extra_hit") {
      const chance = scaleChancePct(spec, attacker.passiveSkillLevel);
      if (chance > 0 && rnd() * 100 < chance) {
        extraHit = true;
        const base = spec.extraHitDamagePct ?? 75;
        const per = spec.extraHitDamagePctPerLevel ?? 0;
        extraHitDamagePct = base + per * Math.max(0, attacker.passiveSkillLevel - 1);
      }
    }
  }
  return { extraHit, extraHitDamagePct };
}

export function applyPassiveOnDamagedStacks(defender: SkillCombatFighter): void {
  if (!defender.passiveSkillId || defender.passiveSkillLevel <= 0) return;
  const specs = skillCombatTriggers(defender.passiveSkillId)?.onDamaged ?? [];
  for (const spec of specs) {
    if (spec.trigger === "stack_crit") {
      const max = spec.maxStacks ?? 10;
      if (defender.skillState.critStacks < max) defender.skillState.critStacks += 1;
    }
  }
}

export function applyActiveSkillExtras(input: {
  attacker: SkillCombatFighter;
  target: SkillCombatFighter;
  activeSkillId: string | null;
  activeSkillLevel: number;
  proc: boolean;
  log: CombatLogLine[];
  rnd: () => number;
}): void {
  const { attacker, target, activeSkillId, activeSkillLevel, proc, log, rnd } = input;
  if (!activeSkillId || activeSkillLevel <= 0) return;
  const triggers = skillCombatTriggers(activeSkillId);
  if (!triggers) return;

  if (proc && triggers.onActiveHit?.length && target.hp > 0) {
    rollStatusApplications(
      scaleOnActiveHitSpecs(triggers.onActiveHit, activeSkillLevel),
      { label: attacker.label, side: attacker.side, statuses: attacker.statuses ?? [] },
      { label: target.label, side: target.side, statuses: target.statuses ?? [] },
      log,
      rnd,
      true,
    );
  }

  for (const spec of triggers.onAttack ?? []) {
    if (!proc && spec.trigger !== "proc_extra_hit" && spec.trigger !== "dancing_sword") continue;

    if (spec.trigger === "proc_extra_hit") {
      const chance = scaleChancePct(spec, activeSkillLevel);
      if (chance <= 0 || rnd() * 100 >= chance || target.hp <= 0) continue;
      const pct = (spec.extraHitDamagePct ?? 75) + (spec.extraHitDamagePctPerLevel ?? 0) * Math.max(0, activeSkillLevel - 1);
      const raw = Math.max(1, Math.floor(rndHit(attacker, rnd) * (pct / 100)));
      const dmg = applyDefense(raw, target.def);
      target.hp = Math.max(0, target.hp - dmg);
      log.push({
        t: "hit",
        side: attacker.side,
        actor: attacker.label,
        target: target.label,
        actorId: attacker.id,
        targetId: target.id,
        damage: dmg,
        kind: "extra",
      });
    }

    if (spec.trigger === "heal_and_damage") {
      const chance = scaleChancePct(spec, activeSkillLevel);
      if (chance <= 0 || rnd() * 100 >= chance) continue;
      const healPct = (spec.healMaxHpPct ?? 8) + (spec.healMaxHpPctPerLevel ?? 0) * Math.max(0, activeSkillLevel - 1);
      const heal = Math.max(1, Math.floor((attacker.maxHp * healPct) / 100));
      const before = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const actual = attacker.hp - before;
      if (actual > 0) {
        log.push({
          t: "heal",
          side: attacker.side,
          actor: attacker.label,
          amount: actual,
          source: "skill",
          skillName: skillNameById(activeSkillId) ?? undefined,
        });
      }
      if (target.hp > 0) {
        const dmg = Math.max(1, Math.floor(actual * (spec.damageFromHealMult ?? 1.6)));
        target.hp = Math.max(0, target.hp - dmg);
        log.push({
          t: "hit",
          side: attacker.side,
          actor: attacker.label,
          target: target.label,
          actorId: attacker.id,
          targetId: target.id,
          damage: dmg,
          kind: "extra",
        });
      }
    }

    if (spec.trigger === "inverse_hp_damage" && target.hp > 0) {
      const missingRatio = attacker.maxHp > 0 ? 1 - attacker.hp / attacker.maxHp : 0;
      const maxMult = (spec.maxDamageMult ?? 2.5) + (spec.maxDamageMultPerLevel ?? 0) * Math.max(0, activeSkillLevel - 1);
      const mult = 1 + missingRatio * Math.max(0, maxMult - 1);
      const raw = Math.max(1, Math.floor(rndHit(attacker, rnd) * mult));
      const dmg = applyDefense(raw, target.def);
      target.hp = Math.max(0, target.hp - dmg);
      log.push({
        t: "hit",
        side: attacker.side,
        actor: attacker.label,
        target: target.label,
        actorId: attacker.id,
        targetId: target.id,
        damage: dmg,
        kind: "crit",
      });
    }

    if (spec.trigger === "low_hp_rebirth") {
      const threshold = spec.hpThresholdPct ?? 45;
      const hpPct = attacker.maxHp > 0 ? (attacker.hp / attacker.maxHp) * 100 : 100;
      if (hpPct > threshold) continue;
      const chance = scaleChancePct(spec, activeSkillLevel);
      if (chance <= 0 || rnd() * 100 >= chance) continue;
      const missing = attacker.maxHp - attacker.hp;
      const healPct = (spec.healMissingHpPct ?? 35) + (spec.healMissingHpPctPerLevel ?? 0) * Math.max(0, activeSkillLevel - 1);
      const heal = Math.max(1, Math.floor((missing * healPct) / 100));
      const before = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const actual = attacker.hp - before;
      if (actual > 0) {
        log.push({
          t: "heal",
          side: attacker.side,
          actor: attacker.label,
          amount: actual,
          source: "skill",
          skillName: skillNameById(activeSkillId) ?? undefined,
        });
      }
      if (target.hp > 0) {
        const dmg = Math.max(1, Math.floor(actual * (spec.damageFromHealMult ?? 1.4)));
        target.hp = Math.max(0, target.hp - dmg);
        log.push({
          t: "hit",
          side: attacker.side,
          actor: attacker.label,
          target: target.label,
          actorId: attacker.id,
          targetId: target.id,
          damage: dmg,
          kind: "extra",
        });
      }
    }

    if (spec.trigger === "dancing_sword") {
      const swords = attacker.skillState.summonedSwords;
      const minSwords = spec.minSwords ?? 2;
      if (swords < minSwords) continue;
      const chance = scaleChancePct(spec, activeSkillLevel);
      if (chance <= 0 || rnd() * 100 >= chance) continue;
      const hitPct =
        (spec.hitDamagePctPerSword ?? 70) + (spec.hitDamagePctPerSwordPerLevel ?? 0) * Math.max(0, activeSkillLevel - 1);
      for (let i = 0; i < swords && target.hp > 0; i++) {
        const raw = Math.max(1, Math.floor(rndHit(attacker, rnd) * (hitPct / 100)));
        const dmg = applyDefense(raw, target.def);
        target.hp = Math.max(0, target.hp - dmg);
        log.push({
          t: "hit",
          side: attacker.side,
          actor: attacker.label,
          target: target.label,
          actorId: attacker.id,
          targetId: target.id,
          damage: dmg,
          kind: "extra",
        });

        // 검 종류별 추가 효과 (최소 구현)
        const kind = attacker.skillState.swordKinds[i];
        if (!kind || target.hp <= 0) continue;
        if (kind === "fire") {
          rollStatusApplications(
            [{ status: "burn", chancePct: 100, turns: 2, potency: 4, maxStacks: 3 }],
            { label: attacker.label, side: attacker.side, statuses: attacker.statuses ?? [] },
            { label: target.label, side: target.side, statuses: target.statuses ?? [] },
            log,
            rnd,
            true,
          );
        } else if (kind === "shock") {
          rollStatusApplications(
            [{ status: "shock", chancePct: 100, turns: 2, potency: 4, maxStacks: 2 }],
            { label: attacker.label, side: attacker.side, statuses: attacker.statuses ?? [] },
            { label: target.label, side: target.side, statuses: target.statuses ?? [] },
            log,
            rnd,
            true,
          );
        } else if (kind === "ice") {
          // 빙결은 강하므로 100% 대신 60%
          rollStatusApplications(
            [{ status: "freeze", chancePct: 60, turns: 1, potency: 100, maxStacks: 1 }],
            { label: attacker.label, side: attacker.side, statuses: attacker.statuses ?? [] },
            { label: target.label, side: target.side, statuses: target.statuses ?? [] },
            log,
            rnd,
            true,
          );
        } else if (kind === "arcane") {
          // 마력검: 이번 타격에 추가 치명 스택 1 (즉시 반영은 다음 공격부터)
          attacker.skillState.critStacks = Math.min(12, attacker.skillState.critStacks + 1);
        }
      }
      attacker.skillState.summonedSwords = 0;
      attacker.skillState.swordKinds = [];
    }
  }
}

export function logPassiveNegate(
  log: CombatLogLine[],
  defender: SkillCombatFighter,
  attackerLabel: string,
  result: DamagedPassiveResult & { handled: true },
): void {
  const skillName = skillNameById(defender.passiveSkillId) ?? undefined;
  if (result.kind === "parry" || result.kind === "nullify") {
    log.push({
      t: "block",
      side: defender.side,
      actor: defender.label,
      attacker: attackerLabel,
      skillName,
    });
    return;
  }
  log.push({
    t: "evade",
    side: defender.side,
    actor: defender.label,
    attacker: attackerLabel,
    skillName,
  });
}

export function applyCounterFromParry(
  defender: SkillCombatFighter,
  attacker: SkillCombatFighter,
  counterDamage: number,
  log: CombatLogLine[],
): void {
  if (counterDamage <= 0 || attacker.hp <= 0) return;
  attacker.hp = Math.max(0, attacker.hp - counterDamage);
  log.push(counterHitLog(defender.side, defender.label, attacker.label, counterDamage));
  if (attacker.hp <= 0) {
    log.push({ t: "ko", side: attacker.side, name: attacker.label });
  }
}
