import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import type { CombatStatusId } from "@/shared/combatStatusLabels";

export type { CombatStatusId } from "@/shared/combatStatusLabels";
export { COMBAT_STATUS_LABEL } from "@/shared/combatStatusLabels";

export type CombatStatusInstance = {
  id: CombatStatusId;
  stacks: number;
  turnsLeft: number;
  potency: number;
  sourceLabel?: string;
};

export type StatusApplySpec = {
  status: CombatStatusId;
  chancePct: number;
  turns: number;
  potency: number;
  maxStacks?: number;
};

export function statusApplyLog(
  side: "party" | "enemy",
  actor: string,
  status: CombatStatusId,
  stacks: number,
): CombatLogLine {
  return { t: "status", action: "apply", side, actor, status, stacks };
}

export function statusTickLog(
  side: "party" | "enemy",
  actor: string,
  status: CombatStatusId,
  amount: number,
): CombatLogLine {
  return { t: "status", action: "tick", side, actor, status, amount };
}

export function statusExpireLog(
  side: "party" | "enemy",
  actor: string,
  status: CombatStatusId,
): CombatLogLine {
  return { t: "status", action: "expire", side, actor, status };
}

export function statusSkipLog(side: "party" | "enemy", actor: string, status: CombatStatusId): CombatLogLine {
  return { t: "status", action: "skip", side, actor, status };
}

export function counterHitLog(
  side: "party" | "enemy",
  actor: string,
  target: string,
  damage: number,
): CombatLogLine {
  return { t: "counter", side, actor, target, damage };
}

export function hasCombatStatus(fighter: { statuses: CombatStatusInstance[] }, id: CombatStatusId): boolean {
  return fighter.statuses.some((s) => s.id === id && s.turnsLeft > 0);
}

export function applyStatusInstance(
  fighter: { statuses: CombatStatusInstance[]; label: string; side: "party" | "enemy" },
  spec: StatusApplySpec,
  log: CombatLogLine[],
  rnd: () => number,
  sourceLabel?: string,
): boolean {
  if (spec.chancePct <= 0 || spec.turns <= 0) return false;
  if (rnd() * 100 >= spec.chancePct) return false;

  const maxStacks = Math.max(1, spec.maxStacks ?? 3);
  const existing = fighter.statuses.find((s) => s.id === spec.status);
  if (existing) {
    existing.turnsLeft = Math.max(existing.turnsLeft, spec.turns);
    existing.potency = Math.max(existing.potency, spec.potency);
    existing.stacks = Math.min(maxStacks, existing.stacks + 1);
    existing.sourceLabel = sourceLabel ?? existing.sourceLabel;
    log.push(statusApplyLog(fighter.side, fighter.label, spec.status, existing.stacks));
    return true;
  }

  fighter.statuses.push({
    id: spec.status,
    stacks: 1,
    turnsLeft: spec.turns,
    potency: spec.potency,
    sourceLabel,
  });
  log.push(statusApplyLog(fighter.side, fighter.label, spec.status, 1));
  return true;
}

function dotDamage(maxHp: number, potency: number, stacks: number, mult = 1): number {
  const pct = Math.max(1, potency) * Math.max(1, stacks) * mult;
  return Math.max(1, Math.floor((maxHp * pct) / 100));
}

/** 라운드 시작 — 도트·지속시간 감소 전 틱 */
export function processStatusRoundStart(
  fighter: {
    label: string;
    side: "party" | "enemy";
    hp: number;
    maxHp: number;
    statuses: CombatStatusInstance[];
  },
  log: CombatLogLine[],
): void {
  for (const st of [...fighter.statuses]) {
    if (st.turnsLeft <= 0) continue;
    if (st.id === "burn" || st.id === "shock") {
      const mult = st.id === "shock" ? 0.85 : 1;
      const dmg = dotDamage(fighter.maxHp, st.potency, st.stacks, mult);
      fighter.hp = Math.max(0, fighter.hp - dmg);
      log.push(statusTickLog(fighter.side, fighter.label, st.id, dmg));
      if (fighter.hp <= 0) {
        log.push({ t: "ko", side: fighter.side, name: fighter.label });
      }
    }
  }
}

/** 행동 전 — 빙결 등. true면 이번 턴 스킵 */
export function processBeforeAction(fighter: {
  label: string;
  side: "party" | "enemy";
  statuses: CombatStatusInstance[];
}): boolean {
  const freeze = fighter.statuses.find((s) => s.id === "freeze" && s.turnsLeft > 0);
  if (!freeze) return false;
  freeze.turnsLeft -= 1;
  return true;
}

export function processStatusRoundEnd(fighter: {
  label: string;
  side: "party" | "enemy";
  statuses: CombatStatusInstance[];
  hp: number;
}): void {
  for (const st of fighter.statuses) {
    if (st.id === "freeze") continue;
    if (st.turnsLeft > 0) st.turnsLeft -= 1;
  }
  for (let i = fighter.statuses.length - 1; i >= 0; i--) {
    const st = fighter.statuses[i]!;
    if (st.turnsLeft <= 0) {
      fighter.statuses.splice(i, 1);
    }
  }
}

/** 피격 후 반격 상태 처리 */
export function processCounterOnDamaged(
  defender: {
    label: string;
    side: "party" | "enemy";
    hp: number;
    statuses: CombatStatusInstance[];
  },
  attacker: { label: string; side: "party" | "enemy"; hp: number },
  damage: number,
  log: CombatLogLine[],
): void {
  if (damage <= 0 || attacker.hp <= 0) return;
  const counter = defender.statuses.find((s) => s.id === "counter" && s.turnsLeft > 0);
  if (!counter) return;
  const reflect = Math.max(1, Math.floor((damage * Math.max(1, counter.potency)) / 100));
  attacker.hp = Math.max(0, attacker.hp - reflect);
  log.push(counterHitLog(defender.side, defender.label, attacker.label, reflect));
  if (attacker.hp <= 0) {
    log.push({ t: "ko", side: attacker.side, name: attacker.label });
  }
}

export function rollStatusApplications(
  specs: StatusApplySpec[],
  attacker: { label: string; side: "party" | "enemy"; statuses: CombatStatusInstance[] },
  target: { label: string; side: "party" | "enemy"; statuses: CombatStatusInstance[] },
  log: CombatLogLine[],
  rnd: () => number,
  targetIsVictim: boolean,
): void {
  for (const spec of specs) {
    const recipient = targetIsVictim ? target : attacker;
    applyStatusInstance(recipient, spec, log, rnd, attacker.label);
  }
}
