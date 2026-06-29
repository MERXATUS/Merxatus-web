import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import type { AtbCombatEvent, AtbCombatSnapshot, AtbFighterView, AtbRow } from "@/shared/atbCombat";
import {
  ATB_GAUGE_MAX,
  ATB_MAX_ACTIONS_PER_SEC,
  ATB_MAX_DT_MS,
  ATB_MAX_ELAPSED_MS,
  atbActionsPerSec,
  atbAttackIntervalMs,
  atbAttacksPerSecView,
} from "@/shared/atbCombat";
import {
  bossFightConfig,
  bossPhaseAtkMultForAtb,
  bossPhaseAttackSpeedMult,
  bossPhaseLabelFor,
  phaseIdForHpRatio,
} from "@/shared/bossPhases";
import {
  performAttack,
  statsFromPower,
  type CombatantInput,
  type FloorEnemy,
} from "@/server/dungeonBattler";
import { fighterStatsFromMonster, scaleFighterStats, scaleFighterStatsByChannel } from "@/server/monsterCombat";
import type { DungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import type { EnemyCombatTags } from "@/shared/equipmentCombatModifiers";
import { emptyCombatModifiers } from "@/shared/equipmentCombatModifiers";
import { effectiveAtkSpdProcPct } from "@/shared/combatUtilBalance";
import type { EquipmentCombatModifiers } from "@/shared/equipmentCombatModifiers";
import {
  applyStatusInstance,
  processBeforeAction,
  processStatusRoundEnd,
  processStatusRoundStart,
  type CombatStatusInstance,
} from "@/shared/combatStatus";
import type { StatusApplySpec } from "@/shared/combatStatus";
import { primarySkillOnActiveEffects } from "@/shared/combatSkillEffects";
import { emptySkillBattleState, type SkillBattleState } from "@/shared/skillCombatRuntime";

type InternalFighter = {
  id: string;
  label: string;
  side: "party" | "enemy";
  row?: AtbRow;
  hp: number;
  maxHp: number;
  atkMin: number;
  atkMax: number;
  def: number;
  nextAttackMs: number;
  attackSpeedMult: number;
  agility: number;
  skillDamageMult: number;
  activeSkillName: string | null;
  activeSkillId: string | null;
  activeSkillLevel: number;
  passiveSkillId: string | null;
  passiveSkillLevel: number;
  passiveLowHpAtkMaxBonusPct: number;
  skillState: SkillBattleState;
  combatMods: EquipmentCombatModifiers;
  statuses: CombatStatusInstance[];
  onHitStatuses: StatusApplySpec[];
};

export type AtbCombatState = {
  seed: number;
  elapsedMs: number;
  lastRoundMarkMs: number;
  eventSeq: number;
  partyDamageMult: number;
  enemyTags: EnemyCombatTags;
  enemyStatMult: number;
  fighters: InternalFighter[];
  outcome: "WIN" | "LOSS" | null;
  phase: number;
  enemyName: string;
  bossSubPhase: number;
  enemyMonsterId?: string | null;
  bossBaseAtkMin?: number;
  bossBaseAtkMax?: number;
  eventLog: AtbCombatEvent[];
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickAlive(fighters: InternalFighter[], side: InternalFighter["side"]) {
  return fighters.filter((f) => f.side === side && f.hp > 0);
}

function pickPartyTarget(fighters: InternalFighter[], rnd: () => number): InternalFighter | null {
  for (const row of ["front", "mid", "back"] as AtbRow[]) {
    const rowTargets = pickAlive(fighters, "party").filter((f) => f.row === row);
    if (rowTargets.length) return rowTargets[Math.floor(rnd() * rowTargets.length)]!;
  }
  const any = pickAlive(fighters, "party");
  return any.length ? any[Math.floor(rnd() * any.length)]! : null;
}

function pickEnemyTarget(fighters: InternalFighter[], rnd: () => number): InternalFighter | null {
  const enemies = pickAlive(fighters, "enemy");
  return enemies.length ? enemies[Math.floor(rnd() * enemies.length)]! : null;
}

function toCombatFighter(f: InternalFighter) {
  return {
    id: f.id,
    label: f.label,
    side: f.side,
    hp: f.hp,
    maxHp: f.maxHp,
    atkMin: f.atkMin,
    atkMax: f.atkMax,
    def: f.def,
    skillDamageMult: f.skillDamageMult,
    activeSkillName: f.activeSkillName,
    activeSkillId: f.activeSkillId,
    activeSkillLevel: f.activeSkillLevel,
    passiveSkillId: f.passiveSkillId,
    passiveSkillLevel: f.passiveSkillLevel,
    passiveLowHpAtkMaxBonusPct: f.passiveLowHpAtkMaxBonusPct,
    skillState: f.skillState,
    combatMods: f.combatMods,
    statuses: f.statuses,
    onHitStatuses: f.onHitStatuses,
  };
}

function resolveFighterId(fighters: InternalFighter[], label: string, idHint?: string): string {
  if (idHint) {
    const byId = fighters.find((f) => f.id === idHint);
    if (byId) return byId.id;
  }
  const byLabel = fighters.find((f) => f.label === label);
  if (byLabel) return byLabel.id;
  return idHint ?? label;
}

function pushEventsFromLog(
  log: CombatLogLine[],
  logStart: number,
  fighters: InternalFighter[],
  eventSeq: number,
  out: AtbCombatEvent[],
) {
  let seq = eventSeq;
  for (let i = logStart; i < log.length; i++) {
    const line = log[i]!;
    seq += 1;
    if (line.t === "hit") {
      out.push({
        seq,
        kind: line.kind === "extra" ? "extra" : "hit",
        actorId: resolveFighterId(fighters, line.actor, line.actorId),
        targetId: resolveFighterId(fighters, line.target, line.targetId),
        amount: line.damage,
        floatKind: "damage",
        crit: line.kind === "crit",
      });
    } else if (line.t === "heal") {
      const actorId = fighters.find((f) => f.label === line.actor)?.id ?? line.actor;
      const lifesteal = line.source === "lifesteal";
      out.push({
        seq,
        kind: "heal",
        actorId,
        targetId: actorId,
        amount: line.amount,
        floatKind: lifesteal ? "lifesteal" : "heal",
      });
    } else if (line.t === "skill") {
      out.push({
        seq,
        kind: "skill",
        actorId: fighters.find((f) => f.label === line.actor)?.id ?? line.actor,
      });
    } else if (line.t === "ko") {
      out.push({
        seq,
        kind: "ko",
        actorId: fighters.find((f) => f.label === line.name)?.id ?? line.name,
      });
    }
  }
  return seq;
}

function checkOutcome(fighters: InternalFighter[]): "WIN" | "LOSS" | null {
  if (pickAlive(fighters, "enemy").length === 0 && pickAlive(fighters, "party").length > 0) return "WIN";
  if (pickAlive(fighters, "party").length === 0) return "LOSS";
  return null;
}

function attackIntervalMs(f: InternalFighter): number {
  return atbAttackIntervalMs(f.agility, f.combatMods?.atkSpdPct ?? 0, f.attackSpeedMult ?? 1);
}

function scheduleNextAttack(actor: InternalFighter) {
  actor.nextAttackMs = attackIntervalMs(actor);
}

function initialAttackDelay(f: InternalFighter, rnd: () => number): number {
  return Math.floor(attackIntervalMs(f) * rnd() * 0.65);
}

function fighterAction(
  state: AtbCombatState,
  actor: InternalFighter,
  rnd: () => number,
  events: AtbCombatEvent[],
): void {
  if (actor.hp <= 0) return;

  const actorCombat = toCombatFighter(actor);
  if (processBeforeAction(actorCombat)) {
    actor.statuses = actorCombat.statuses;
    state.eventSeq += 1;
    events.push({ seq: state.eventSeq, kind: "action", actorId: actor.id });
    scheduleNextAttack(actor);
    return;
  }

  const log: CombatLogLine[] = [];

  if (actor.side === "party") {
    const target = pickEnemyTarget(state.fighters, rnd);
    if (!target) {
      scheduleNextAttack(actor);
      return;
    }
    const targetCombat = toCombatFighter(target);
    const activeSkill = !!actor.activeSkillName;
    const skillFx = activeSkill
      ? primarySkillOnActiveEffects(actor.activeSkillId, actor.activeSkillLevel)
      : { onActiveHit: [], onActiveSelf: [] };
    if (actor.activeSkillName) {
      log.push({ t: "skill", side: "party", actor: actor.label, skillName: actor.activeSkillName });
      for (const spec of skillFx.onActiveSelf) {
        applyStatusInstance(actorCombat, spec, log, rnd);
      }
    }
    performAttack({
      attacker: actorCombat,
      target: targetCombat,
      rnd,
      log,
      partyDamageMult: state.partyDamageMult,
      enemyTags: state.enemyTags,
      activeSkillHit: activeSkill,
    });
    target.hp = targetCombat.hp;
    actor.hp = actorCombat.hp;
    if (activeSkill && target.hp > 0) {
      for (const spec of skillFx.onActiveHit) {
        applyStatusInstance(targetCombat, spec, log, rnd, actor.label);
      }
      target.hp = targetCombat.hp;
    }
    const extraChance = effectiveAtkSpdProcPct(actor.combatMods.atkSpdPct);
    if (extraChance > 0 && target.hp > 0 && rnd() * 100 < extraChance) {
      performAttack({
        attacker: actorCombat,
        target: targetCombat,
        rnd,
        log,
        partyDamageMult: state.partyDamageMult,
        enemyTags: state.enemyTags,
        hitKind: "extra",
      });
      target.hp = targetCombat.hp;
    }
  } else {
    const target = pickPartyTarget(state.fighters, rnd);
    if (!target) {
      scheduleNextAttack(actor);
      return;
    }
    const targetCombat = toCombatFighter(target);
    performAttack({
      attacker: actorCombat,
      target: targetCombat,
      rnd,
      log,
      partyDamageMult: 1,
      enemyTags: state.enemyTags,
    });
    target.hp = targetCombat.hp;
    actor.hp = actorCombat.hp;
  }

  actor.statuses = actorCombat.statuses;
  appendEventsFromActionLog(state, events, log, { actor });
  state.eventSeq += 1;
  events.push({ seq: state.eventSeq, kind: "action", actorId: actor.id });
  scheduleNextAttack(actor);
}

function appendEventsFromActionLog(
  state: AtbCombatState,
  events: AtbCombatEvent[],
  log: CombatLogLine[],
  ctx: { actor: InternalFighter },
) {
  if (!Number.isFinite(state.eventSeq)) state.eventSeq = 0;
  for (const line of log) {
    if (line.t === "hit") {
      state.eventSeq += 1;
      events.push({
        seq: state.eventSeq,
        kind: line.kind === "extra" ? "extra" : "hit",
        actorId: ctx.actor.id,
        targetId: line.targetId ?? resolveFighterId(state.fighters, line.target),
        amount: line.damage,
        floatKind: "damage",
        crit: line.kind === "crit",
      });
    } else if (line.t === "heal") {
      const actorId = resolveFighterId(state.fighters, line.actor);
      const lifesteal = line.source === "lifesteal";
      state.eventSeq += 1;
      events.push({
        seq: state.eventSeq,
        kind: "heal",
        actorId,
        targetId: actorId,
        amount: line.amount,
        floatKind: lifesteal ? "lifesteal" : "heal",
      });
    } else if (line.t === "skill") {
      state.eventSeq += 1;
      events.push({
        seq: state.eventSeq,
        kind: "skill",
        actorId: ctx.actor.id,
      });
    }
  }
}

function processRoundHooks(state: AtbCombatState, rnd: () => number, events: AtbCombatEvent[]) {
  const log: CombatLogLine[] = [];
  for (const f of state.fighters) {
    if (f.hp <= 0) continue;
    const cf = toCombatFighter(f);
    processStatusRoundStart(cf, log);
    f.hp = cf.hp;
    f.statuses = cf.statuses;
  }
  for (const f of pickAlive(state.fighters, "party")) {
    const regen = f.combatMods.regenHpPerRound;
    if (regen <= 0) continue;
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + regen);
    const actual = f.hp - before;
    if (actual > 0) log.push({ t: "heal", side: "party", actor: f.label, amount: actual, source: "regen" });
  }
  state.eventSeq = pushEventsFromLog(log, 0, state.fighters, state.eventSeq, events);
  for (const f of state.fighters) {
    if (f.hp <= 0) continue;
    const cf = toCombatFighter(f);
    processStatusRoundEnd(cf);
    f.statuses = cf.statuses;
  }
}

function checkBossSubPhaseTransition(state: AtbCombatState, events: AtbCombatEvent[]) {
  if (!state.enemyTags.isBoss) return;
  const enemy = state.fighters.find((f) => f.side === "enemy" && f.hp > 0);
  if (!enemy) return;
  const config = bossFightConfig(state.enemyMonsterId ?? null, true);
  if (!config) return;

  const hpRatio = enemy.hp / Math.max(1, enemy.maxHp);
  const nextPhase = phaseIdForHpRatio(hpRatio, config);
  if (nextPhase <= state.bossSubPhase) return;

  state.bossSubPhase = nextPhase;

  const baseMin = state.bossBaseAtkMin ?? enemy.atkMin;
  const baseMax = state.bossBaseAtkMax ?? enemy.atkMax;
  const atkMult = bossPhaseAtkMultForAtb(nextPhase, config);
  enemy.atkMin = Math.max(1, Math.floor(baseMin * atkMult));
  enemy.atkMax = Math.max(enemy.atkMin, Math.floor(baseMax * atkMult));

  const spdMult = bossPhaseAttackSpeedMult(nextPhase);
  enemy.attackSpeedMult = Math.min(
    ATB_MAX_ACTIONS_PER_SEC / Math.max(0.125, atbActionsPerSec(enemy.agility, enemy.combatMods?.atkSpdPct ?? 0)),
    (enemy.attackSpeedMult ?? 1) * spdMult,
  );

  const phase = config.phases.find((p) => p.id === nextPhase);
  state.eventSeq += 1;
  events.push({
    seq: state.eventSeq,
    kind: "phase_change",
    actorId: enemy.id,
    phaseLabel: phase?.label ?? bossPhaseLabelFor(state.enemyMonsterId ?? null, nextPhase),
  });
}

function partyMemberToInternalFighter(
  p: CombatantInput,
  input: {
    partyHp: Record<string, { hp: number; maxHp: number }>;
    rowByMinionId: Map<string, AtbRow>;
    agilityByMinionId: Map<string, number>;
  },
): InternalFighter {
  const st = statsFromPower(p.power);
  const saved = input.partyHp[p.id];
  const bonusHp = Math.max(0, Math.floor(p.bonusHp ?? 0));
  const maxHp = saved?.maxHp ?? st.maxHp + bonusHp;
  const hp = Math.min(maxHp, Math.max(0, saved?.hp ?? maxHp));
  const agility = input.agilityByMinionId.get(p.id) ?? 0;
  const fighter: InternalFighter = {
    id: p.id,
    label: p.label,
    side: "party",
    row: input.rowByMinionId.get(p.id),
    hp,
    maxHp,
    atkMin: st.atkMin,
    atkMax: st.atkMax,
    def: Math.max(0, Math.floor(p.bonusDef ?? 0)),
    nextAttackMs: 0,
    attackSpeedMult: 1,
    agility,
    skillDamageMult: Math.max(1, p.skillDamageMult ?? 1),
    activeSkillName: p.activeSkillName?.trim() || null,
    activeSkillId: p.activeSkillId?.trim() || null,
    activeSkillLevel: Math.max(0, Math.floor(p.activeSkillLevel ?? 0)),
    passiveSkillId: p.passiveSkillId?.trim() || null,
    passiveSkillLevel: Math.max(0, Math.floor(p.passiveSkillLevel ?? 0)),
    passiveLowHpAtkMaxBonusPct: Math.max(0, Math.floor(p.passiveLowHpAtkMaxBonusPct ?? 0)),
    skillState: emptySkillBattleState(),
    combatMods: p.combatMods ?? emptyCombatModifiers(),
    statuses: [],
    onHitStatuses: [...(p.onHitStatuses ?? [])],
  };
  fighter.nextAttackMs = initialAttackDelay(fighter, Math.random);
  return fighter;
}

function combatantToEnemyFighter(
  p: CombatantInput,
  hp: { hp: number; maxHp: number },
  agility: number,
  id = "enemy_0",
): InternalFighter {
  const st = statsFromPower(p.power);
  const bonusHp = Math.max(0, Math.floor(p.bonusHp ?? 0));
  const maxHp = hp.maxHp ?? st.maxHp + bonusHp;
  const curHp = Math.min(maxHp, Math.max(0, hp.hp ?? maxHp));
  const atkSpd = p.combatMods?.atkSpdPct ?? 0;
  const fighter: InternalFighter = {
    id,
    label: p.label,
    side: "enemy",
    hp: curHp,
    maxHp,
    atkMin: st.atkMin,
    atkMax: st.atkMax,
    def: Math.max(0, Math.floor(p.bonusDef ?? 0)),
    nextAttackMs: 0,
    attackSpeedMult: 1,
    agility: Math.max(0, agility),
    skillDamageMult: Math.max(1, p.skillDamageMult ?? 1),
    activeSkillName: p.activeSkillName?.trim() || null,
    activeSkillId: p.activeSkillId?.trim() || null,
    activeSkillLevel: Math.max(0, Math.floor(p.activeSkillLevel ?? 0)),
    passiveSkillId: p.passiveSkillId?.trim() || null,
    passiveSkillLevel: Math.max(0, Math.floor(p.passiveSkillLevel ?? 0)),
    passiveLowHpAtkMaxBonusPct: Math.max(0, Math.floor(p.passiveLowHpAtkMaxBonusPct ?? 0)),
    skillState: emptySkillBattleState(),
    combatMods: p.combatMods ?? emptyCombatModifiers(),
    statuses: [],
    onHitStatuses: [...(p.onHitStatuses ?? [])],
  };
  fighter.nextAttackMs = initialAttackDelay(fighter, Math.random);
  return fighter;
}

export function initAtbCombat(input: {
  party: CombatantInput[];
  partyHp: Record<string, { hp: number; maxHp: number }>;
  rowByMinionId: Map<string, AtbRow>;
  agilityByMinionId: Map<string, number>;
  enemy: FloorEnemy;
  enemyStatMult: number;
  enemyCombatMults?: DungeonEnemyCombatMults;
  partyDamageMult: number;
  enemyTags: EnemyCombatTags;
  phase: number;
  monsterId?: string;
  seed?: number;
}): AtbCombatState {
  const seed = input.seed ?? Math.floor(Math.random() * 0xffffffff);
  const partyFighters: InternalFighter[] = input.party.map((p) =>
    partyMemberToInternalFighter(p, {
      partyHp: input.partyHp,
      rowByMinionId: input.rowByMinionId,
      agilityByMinionId: input.agilityByMinionId,
    }),
  );

  for (let pi = 0; pi < partyFighters.length; pi++) {
    const specs = input.party[pi]?.onFightStartSelfStatuses ?? [];
    const log: CombatLogLine[] = [];
    const rnd = mulberry32(seed + pi);
    const cf = toCombatFighter(partyFighters[pi]!);
    for (const spec of specs) {
      applyStatusInstance(cf, spec, log, rnd);
    }
    partyFighters[pi]!.statuses = cf.statuses;
  }

  const baseEnemy = fighterStatsFromMonster(input.enemy.monster);
  const enemyStats = input.enemyCombatMults
    ? scaleFighterStatsByChannel(baseEnemy, input.enemyCombatMults)
    : input.enemyStatMult > 1
      ? scaleFighterStats(baseEnemy, input.enemyStatMult)
      : baseEnemy;
  const enemyLabel = `[${input.enemy.name}]`;

  const enemyAgility = input.enemyTags.isBoss ? 3 : 0;
  const enemies: InternalFighter[] = [
    {
      id: "enemy_0",
      label: enemyLabel,
      side: "enemy",
      hp: enemyStats.maxHp,
      maxHp: enemyStats.maxHp,
      atkMin: enemyStats.atkMin,
      atkMax: enemyStats.atkMax,
      def: enemyStats.def,
      nextAttackMs: 0,
      attackSpeedMult: 1,
      agility: enemyAgility,
      skillDamageMult: 1,
      activeSkillName: null,
      activeSkillId: null,
      activeSkillLevel: 0,
      passiveSkillId: null,
      passiveSkillLevel: 0,
      passiveLowHpAtkMaxBonusPct: 0,
      skillState: emptySkillBattleState(),
      combatMods: emptyCombatModifiers(),
      statuses: [],
      onHitStatuses: [],
    },
  ];
  enemies[0]!.nextAttackMs = initialAttackDelay(enemies[0]!, () => Math.random());

  return {
    seed,
    elapsedMs: 0,
    lastRoundMarkMs: 0,
    eventSeq: 0,
    partyDamageMult: input.partyDamageMult,
    enemyTags: input.enemyTags,
    enemyStatMult: input.enemyStatMult,
    fighters: [...partyFighters, ...enemies],
    outcome: null,
    phase: input.phase,
    enemyName: enemyLabel,
    bossSubPhase: 1,
    enemyMonsterId: input.monsterId ?? null,
    bossBaseAtkMin: enemyStats.atkMin,
    bossBaseAtkMax: enemyStats.atkMax,
    eventLog: [],
  };
}

/** PvP 등 — 몬스터 대신 플레이어 미니언을 적으로 */
export function initAtbDuelCombat(input: {
  party: CombatantInput[];
  partyHp: Record<string, { hp: number; maxHp: number }>;
  rowByMinionId?: Map<string, AtbRow>;
  agilityByMinionId: Map<string, number>;
  enemyCombatant: CombatantInput;
  enemyHp: { hp: number; maxHp: number };
  enemyAgility?: number;
  partyDamageMult?: number;
  enemyTags?: EnemyCombatTags;
  phase?: number;
  seed?: number;
}): AtbCombatState {
  const rowByMinionId = input.rowByMinionId ?? new Map<string, AtbRow>();
  const seed = input.seed ?? Math.floor(Math.random() * 0xffffffff);
  const partyFighters = input.party.map((p) =>
    partyMemberToInternalFighter(p, {
      partyHp: input.partyHp,
      rowByMinionId,
      agilityByMinionId: input.agilityByMinionId,
    }),
  );

  for (let pi = 0; pi < partyFighters.length; pi++) {
    const specs = input.party[pi]?.onFightStartSelfStatuses ?? [];
    const log: CombatLogLine[] = [];
    const rnd = mulberry32(seed + pi);
    const cf = toCombatFighter(partyFighters[pi]!);
    for (const spec of specs) {
      applyStatusInstance(cf, spec, log, rnd);
    }
    partyFighters[pi]!.statuses = cf.statuses;
  }

  const enemyAgility = input.enemyAgility ?? input.agilityByMinionId.get(input.enemyCombatant.id) ?? 0;
  const enemy = combatantToEnemyFighter(input.enemyCombatant, input.enemyHp, enemyAgility);

  return {
    seed,
    elapsedMs: 0,
    lastRoundMarkMs: 0,
    eventSeq: 0,
    partyDamageMult: input.partyDamageMult ?? 1,
    enemyTags: input.enemyTags ?? { isBoss: false, isAngel: false, isDemon: false },
    enemyStatMult: 1,
    fighters: [...partyFighters, enemy],
    outcome: null,
    phase: input.phase ?? 1,
    enemyName: input.enemyCombatant.label,
    bossSubPhase: 1,
    eventLog: [],
  };
}

export function stepAtbCombat(
  state: AtbCombatState,
  dtMs: number,
): { state: AtbCombatState; events: AtbCombatEvent[]; done: boolean } {
  if (state.outcome) {
    return { state, events: [], done: true };
  }

  const dt = Math.max(0, Math.min(ATB_MAX_DT_MS, Math.floor(dtMs)));
  const rnd = mulberry32(state.seed + state.elapsedMs);
  const events: AtbCombatEvent[] = [];
  const next: AtbCombatState = {
    ...state,
    fighters: state.fighters.map((f) => ({ ...f, statuses: f.statuses.map((s) => ({ ...s })) })),
  };
  if (!Number.isFinite(next.eventSeq)) next.eventSeq = 0;

  next.elapsedMs += dt;

  if (next.elapsedMs - next.lastRoundMarkMs >= 5000) {
    next.lastRoundMarkMs = next.elapsedMs;
    processRoundHooks(next, rnd, events);
  }

  for (const f of next.fighters) {
    if (f.hp <= 0) continue;
    if (!Number.isFinite(f.nextAttackMs)) f.nextAttackMs = attackIntervalMs(f);
    f.nextAttackMs = Math.max(0, f.nextAttackMs - dt);
  }

  let actions = 0;
  while (actions < 8) {
    const ready = pickAlive(next.fighters, "party")
      .concat(pickAlive(next.fighters, "enemy"))
      .filter((f) => (f.nextAttackMs ?? 0) <= 0)
      .sort((a, b) => (a.nextAttackMs ?? 0) - (b.nextAttackMs ?? 0) || b.agility - a.agility);
    if (!ready.length) break;
    const actor = ready[0]!;
    fighterAction(next, actor, rnd, events);
    actions += 1;
    checkBossSubPhaseTransition(next, events);
    const outcome = checkOutcome(next.fighters);
    if (outcome) {
      next.outcome = outcome;
      break;
    }
  }

  if (!next.outcome && next.elapsedMs >= ATB_MAX_ELAPSED_MS) {
    next.outcome = pickAlive(next.fighters, "party").length > 0 ? "WIN" : "LOSS";
  }

  next.eventLog = [...(state.eventLog ?? []), ...events];

  return { state: next, events, done: next.outcome != null };
}

export function atbSnapshot(state: AtbCombatState, events: AtbCombatEvent[]): AtbCombatSnapshot {
  const bossPhaseLabel =
    state.enemyTags.isBoss && state.bossSubPhase > 0
      ? bossPhaseLabelFor(state.enemyMonsterId ?? null, state.bossSubPhase)
      : null;
  return {
    elapsedMs: state.elapsedMs,
    phase: state.phase,
    enemyName: state.enemyName,
    outcome: state.outcome,
    events,
    bossSubPhase: state.bossSubPhase,
    bossPhaseLabel,
    fighters: state.fighters.map(
      (f): AtbFighterView => ({
        id: f.id,
        label: f.label,
        side: f.side,
        row: f.row,
        hp: f.hp,
        maxHp: f.maxHp,
        attacksPerSec: atbAttacksPerSecView(
          f.agility,
          f.combatMods?.atkSpdPct ?? 0,
          f.attackSpeedMult ?? 1,
        ),
        dead: f.hp <= 0,
      }),
    ),
  };
}

export function serializeAtbState(state: AtbCombatState): string {
  return JSON.stringify(state);
}

export function parseAtbState(raw: string | null | undefined): AtbCombatState | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as AtbCombatState;
    if (parsed.bossSubPhase == null) parsed.bossSubPhase = 1;
    if (parsed.eventLog == null) parsed.eventLog = [];
    if (parsed.eventSeq == null || !Number.isFinite(parsed.eventSeq)) {
      parsed.eventSeq = parsed.eventLog.reduce((max, e) => Math.max(max, Number(e.seq) || 0), 0);
    }
    for (const f of parsed.fighters ?? []) {
      if (f.attackSpeedMult == null || !Number.isFinite(f.attackSpeedMult)) f.attackSpeedMult = 1;
      const legacyGauge = (f as { gauge?: number }).gauge;
      const legacySpeed = (f as { gaugeSpeed?: number }).gaugeSpeed;
      if (f.nextAttackMs == null || !Number.isFinite(f.nextAttackMs)) {
        const lg = legacyGauge;
        const ls = legacySpeed;
        if (typeof lg === "number" && typeof ls === "number" && ls > 0) {
          f.nextAttackMs = Math.max(0, ((ATB_GAUGE_MAX - lg) / ls) * 1000);
        } else {
          f.nextAttackMs = initialAttackDelay(f as InternalFighter, Math.random);
        }
      }
      delete (f as { gauge?: number }).gauge;
      delete (f as { gaugeSpeed?: number }).gaugeSpeed;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function partyHpFromAtbState(state: AtbCombatState) {
  return state.fighters
    .filter((f) => f.side === "party")
    .map((f) => ({
      minionId: f.id,
      hp: f.hp,
      maxHp: f.maxHp,
      label: f.label,
    }));
}

export function runAtbCombatToCompletion(
  initial: AtbCombatState,
  tickMs = 100,
  sampleEvery = 2,
): { finalState: AtbCombatState; events: AtbCombatEvent[]; snapshots: AtbCombatSnapshot[] } {
  const allEvents: AtbCombatEvent[] = [];
  const snapshots: AtbCombatSnapshot[] = [atbSnapshot(initial, [])];
  let state = initial;
  let tick = 0;
  const maxTicks = Math.ceil(ATB_MAX_ELAPSED_MS / Math.max(16, tickMs)) + 10;

  while (!state.outcome && tick < maxTicks) {
    const step = stepAtbCombat(state, tickMs);
    state = step.state;
    allEvents.push(...step.events);
    tick += 1;
    if (tick % sampleEvery === 0 || step.done) {
      snapshots.push(atbSnapshot(state, step.events));
    }
    if (step.done) break;
  }

  if (!state.outcome) {
    state = { ...state, outcome: pickAlive(state.fighters, "party").length > 0 ? "WIN" : "LOSS" };
    snapshots.push(atbSnapshot(state, []));
  }

  return { finalState: state, events: allEvents, snapshots };
}
