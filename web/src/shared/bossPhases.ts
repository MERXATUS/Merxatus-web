import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import type { CombatStatusInstance } from "@/shared/combatStatus";
import type { CombatStatusId } from "@/shared/combatStatusLabels";
import { applyStatusInstance, type StatusApplySpec } from "@/shared/combatStatus";

/** 보스 페이즈 전환 시 스탯·기믹 */
export type BossPhaseModifiers = {
  atkMult?: number;
  defMult?: number;
  healPctOfMax?: number;
  extraHitChancePct?: number;
  healsOnHitPct?: number;
  regenPctPerRound?: number;
};

export type BossPhaseGimmick = {
  onHitParty?: StatusApplySpec;
  onEnterParty?: StatusApplySpec[];
  onEnterSelf?: StatusApplySpec[];
  everyNRoundsParty?: StatusApplySpec;
};

export type BossPhaseDef = {
  id: number;
  /** HP 비율이 이 값 이하이면 해당 페이즈 (1.01 = 시작) */
  hpBelow: number;
  label: string;
  flavor?: string;
  modifiers?: BossPhaseModifiers;
  gimmick?: BossPhaseGimmick;
};

export type BossFightConfig = {
  phases: BossPhaseDef[];
  /** 보스 공통 — 타격 시 파티에 부여 */
  onHitParty?: StatusApplySpec;
  /** 매 라운드 파티 전체 */
  auraEveryRound?: StatusApplySpec;
};

export type BossFightRuntime = {
  monsterId: string;
  config: BossFightConfig;
  currentPhaseId: number;
  roundCounter: number;
  baseAtkMin: number;
  baseAtkMax: number;
  baseDef: number;
  atkMult: number;
  extraHitChancePct: number;
  healsOnHitPct: number;
  regenPctPerRound: number;
  auraEveryRound: StatusApplySpec | null;
  onHitParty: StatusApplySpec | null;
  everyNRoundsParty: StatusApplySpec | null;
  everyNRounds: number;
};

export type BossFighterSlice = {
  label: string;
  side: "party" | "enemy";
  hp: number;
  maxHp: number;
  atkMin: number;
  atkMax: number;
  def: number;
  onHitStatuses: StatusApplySpec[];
  statuses: CombatStatusInstance[];
};

function status(
  id: CombatStatusId,
  chancePct: number,
  turns: number,
  potency: number,
): StatusApplySpec {
  return { status: id, chancePct, turns, potency };
}

function phases(...defs: BossPhaseDef[]): BossFightConfig {
  return { phases: defs };
}

export const DEFAULT_BOSS_PHASES: BossFightConfig = phases(
  { id: 1, hpBelow: 1.01, label: "1페이즈" },
  {
    id: 2,
    hpBelow: 0.7,
    label: "2페이즈 — 분노",
    flavor: "공격이 거세어진다",
    modifiers: { atkMult: 1.25 },
  },
  {
    id: 3,
    hpBelow: 0.4,
    label: "3페이즈 — 광폭",
    flavor: "최후의 발악!",
    modifiers: { atkMult: 1.3, extraHitChancePct: 15 },
  },
);

/** 보스별 페이즈·기믹 — 몬스터 ID 키 */
export const BOSS_CONFIG_BY_MONSTER_ID: Record<string, BossFightConfig> = {
  // 던전 보스
  slime_king: {
    onHitParty: status("burn", 28, 3, 4),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 군주" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 분열",
        flavor: "점액이 소용돌이친다",
        modifiers: { healPctOfMax: 0.1, atkMult: 1.15 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 마염",
        flavor: "불꽃 점액이 튄다!",
        modifiers: { atkMult: 1.3 },
        gimmick: { onHitParty: status("burn", 45, 4, 6) },
      },
    ],
  },
  goblin_chieftain: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 군번장" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 방벽",
      flavor: "부하들이 방패를 세운다",
      modifiers: { defMult: 1.5 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 돌격",
      flavor: "무모한 돌격!",
      modifiers: { atkMult: 1.4, defMult: 0.85 },
    },
  ),
  wolf_alpha: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 우두머리" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 사냥",
      flavor: "연속 물어뜯기!",
      modifiers: { extraHitChancePct: 35 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 광란",
      flavor: "피 냄새에 미쳤다",
      modifiers: { atkMult: 1.35, extraHitChancePct: 25 },
    },
  ),
  skeleton_lord: {
    onHitParty: status("shock", 22, 2, 3),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 장군" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 망령",
        flavor: "유골 병사가 일어난다",
        modifiers: { atkMult: 1.2 },
        gimmick: { onHitParty: status("shock", 35, 3, 4) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 낙천",
        flavor: "전장 전체에 뇌명!",
        modifiers: { atkMult: 1.28 },
        gimmick: {
          onEnterParty: [status("shock", 100, 2, 5)],
        },
      },
    ],
  },
  flame_tyrant: {
    onHitParty: status("burn", 30, 3, 5),
    auraEveryRound: status("burn", 18, 2, 3),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 폭군" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 화염",
        flavor: "주변 공기가 타오른다",
        modifiers: { atkMult: 1.22 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 심판",
        flavor: "화염 폭풍!",
        modifiers: { atkMult: 1.35 },
        gimmick: { everyNRoundsParty: status("burn", 100, 2, 6) },
      },
    ],
  },
  frost_titan: {
    onHitParty: status("freeze", 15, 1, 1),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 거신" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 한기",
        flavor: "서릿발이 멈춤을 온다",
        modifiers: { defMult: 1.25 },
        gimmick: { onHitParty: status("freeze", 28, 1, 1) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 빙결",
        flavor: "대지가 얼어붙는다",
        modifiers: { atkMult: 1.3 },
        gimmick: { onEnterParty: [status("freeze", 100, 1, 1)] },
      },
    ],
  },
  elder_dragon: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 고룡" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 분노",
      flavor: "용의 포효!",
      modifiers: { atkMult: 1.28 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 재앙",
      flavor: "브레스를 모은다",
      modifiers: { atkMult: 1.4, extraHitChancePct: 20 },
    },
  ),
  void_harbinger: {
    onHitParty: status("shock", 25, 2, 4),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 사자" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 균열",
        flavor: "차원의 틈이 벌어진다",
        modifiers: { atkMult: 1.25 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 심연",
        flavor: "공허가 파고든다",
        modifiers: { atkMult: 1.35 },
        gimmick: { onHitParty: status("shock", 40, 3, 6) },
      },
    ],
  },
  void_overlord: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 군주" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 공허",
      flavor: "공간이 뒤틀린다",
      modifiers: { healPctOfMax: 0.12 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 종말",
      flavor: "모든 것을 삼킨다",
      modifiers: { atkMult: 1.38 },
      gimmick: { onHitParty: status("shock", 35, 2, 5) },
    },
  ),
  // 레이드 — 7대죄악
  demon_lucifer: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 오만" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 천상",
      flavor: "오만한 방어막",
      modifiers: { defMult: 1.3 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 타락",
      flavor: "천사장의 분노",
      modifiers: { atkMult: 1.35, defMult: 0.9 },
    },
  ),
  demon_leviathan: {
    onHitParty: status("shock", 25, 2, 4),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 질투" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 시선",
        flavor: "시선이 가시가 된다",
        modifiers: { atkMult: 1.2 },
        gimmick: { onHitParty: status("shock", 38, 3, 5) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 심연",
        flavor: "질투가 파도처럼 밀려온다",
        modifiers: { atkMult: 1.32, extraHitChancePct: 18 },
      },
    ],
  },
  demon_satan: {
    onHitParty: status("burn", 30, 3, 5),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 분노" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 지옥불",
        flavor: "화염이 솟구친다",
        modifiers: { atkMult: 1.3 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 광폭",
        flavor: "분노가 폭발한다!",
        modifiers: { atkMult: 1.42, extraHitChancePct: 20 },
      },
    ],
  },
  demon_belphegor: {
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 나태" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 잠식",
        flavor: "무기력한 기운이 퍼진다",
        modifiers: { defMult: 1.35 },
        gimmick: { everyNRoundsParty: status("freeze", 100, 1, 1) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 침식",
        flavor: "모든 의지가 무너진다",
        modifiers: { atkMult: 1.25 },
        gimmick: { onEnterParty: [status("freeze", 100, 1, 1)] },
      },
    ],
  },
  demon_mammon: {
    onHitParty: status("shock", 18, 2, 3),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 탐욕" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 금고",
        flavor: "탐욕의 방패",
        modifiers: { defMult: 1.45 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 수확",
        flavor: "모든 것을 집어삼킨다",
        modifiers: { atkMult: 1.3 },
        gimmick: { onEnterSelf: [status("counter", 100, 3, 8)] },
      },
    ],
  },
  demon_beelzebub: {
    onHitParty: status("burn", 22, 2, 3),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 식탐" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 포식",
        flavor: "살을 갉아먹는다",
        modifiers: { healsOnHitPct: 25, atkMult: 1.18 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 만복",
        flavor: "피로 배를 채운다",
        modifiers: { healsOnHitPct: 35, atkMult: 1.3 },
      },
    ],
  },
  demon_asmodeus: {
    onHitParty: status("shock", 32, 3, 5),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 색욕" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 유혹",
        flavor: "매혹의 전기",
        modifiers: { atkMult: 1.22 },
        gimmick: { onHitParty: status("shock", 45, 3, 6) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 광기",
        flavor: "이성이 사라진다",
        modifiers: { atkMult: 1.36, extraHitChancePct: 22 },
      },
    ],
  },
  // 레이드 — 7대미덕
  angel_michael: DEFAULT_BOSS_PHASES,
  angel_raguel: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 친절" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 수호",
      flavor: "치유의 빛",
      modifiers: { healPctOfMax: 0.15, defMult: 1.2 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 심판",
      flavor: "정의의 일격",
      modifiers: { atkMult: 1.32 },
    },
  ),
  angel_jophiel: {
    onHitParty: status("freeze", 18, 1, 1),
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 인내" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 결빙",
        flavor: "인내의 한기",
        modifiers: { defMult: 1.3 },
        gimmick: { onHitParty: status("freeze", 30, 1, 1) },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 정적",
        flavor: "시간이 멈춘다",
        modifiers: { atkMult: 1.28 },
        gimmick: { onEnterParty: [status("freeze", 100, 1, 1)] },
      },
    ],
  },
  angel_gabriel: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 근면" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 가속",
      flavor: "쉬지 않는 일격",
      modifiers: { extraHitChancePct: 30 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 풍류",
      flavor: "연속 참격!",
      modifiers: { atkMult: 1.3, extraHitChancePct: 25 },
    },
  ),
  angel_raphael: {
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 자선", modifiers: { regenPctPerRound: 0.02 } },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 회복",
        flavor: "생명의 샘",
        modifiers: { healPctOfMax: 0.1, regenPctPerRound: 0.035 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 축복",
        flavor: "끊임없는 재생",
        modifiers: { regenPctPerRound: 0.05, atkMult: 1.2 },
      },
    ],
  },
  angel_uriel: phases(
    { id: 1, hpBelow: 1.01, label: "1페이즈 — 절제" },
    {
      id: 2,
      hpBelow: 0.7,
      label: "2페이즈 — 균형",
      flavor: "과욕을 억제한다",
      modifiers: { defMult: 1.4 },
    },
    {
      id: 3,
      hpBelow: 0.4,
      label: "3페이즈 — 수양",
      flavor: "모든 공격을 흘린다",
      modifiers: { defMult: 1.25, atkMult: 1.25 },
    },
  ),
  angel_sariel: {
    phases: [
      { id: 1, hpBelow: 1.01, label: "1페이즈 — 순결" },
      {
        id: 2,
        hpBelow: 0.7,
        label: "2페이즈 — 결계",
        flavor: "신성한 방벽",
        modifiers: { defMult: 1.35 },
      },
      {
        id: 3,
        hpBelow: 0.4,
        label: "3페이즈 — 역린",
        flavor: "반격의 결계!",
        modifiers: { atkMult: 1.28 },
        gimmick: { onEnterSelf: [status("counter", 100, 4, 10)] },
      },
    ],
  },
};

export function bossFightConfig(monsterId: string | null | undefined, isBoss: boolean): BossFightConfig | null {
  if (!isBoss) return null;
  const id = (monsterId ?? "").trim().toLowerCase();
  if (id && BOSS_CONFIG_BY_MONSTER_ID[id]) return BOSS_CONFIG_BY_MONSTER_ID[id]!;
  return DEFAULT_BOSS_PHASES;
}

export function bossPhaseLabelFor(monsterId: string | null | undefined, phaseId: number): string {
  const id = (monsterId ?? "").trim().toLowerCase();
  const config = id ? BOSS_CONFIG_BY_MONSTER_ID[id] : null;
  const phases = config?.phases ?? DEFAULT_BOSS_PHASES.phases;
  return phases.find((p) => p.id === phaseId)?.label ?? `${phaseId}페이즈`;
}

export function phaseIdForHpRatio(ratio: number, config: BossFightConfig): number {
  let phaseId = 1;
  for (const p of config.phases) {
    if (ratio <= p.hpBelow) phaseId = p.id;
  }
  return phaseId;
}

export function createBossRuntime(
  monsterId: string,
  enemy: { atkMin: number; atkMax: number; def: number },
  isBoss: boolean,
): BossFightRuntime | null {
  const config = bossFightConfig(monsterId, isBoss);
  if (!config) return null;
  const onHit = config.onHitParty ?? null;
  return {
    monsterId: monsterId.trim().toLowerCase(),
    config,
    currentPhaseId: 1,
    roundCounter: 0,
    baseAtkMin: enemy.atkMin,
    baseAtkMax: enemy.atkMax,
    baseDef: enemy.def,
    atkMult: 1,
    extraHitChancePct: 0,
    healsOnHitPct: 0,
    regenPctPerRound: 0,
    auraEveryRound: config.auraEveryRound ?? null,
    onHitParty: onHit,
    everyNRoundsParty: null,
    everyNRounds: 0,
  };
}

function syncEnemyStats(enemy: BossFighterSlice, runtime: BossFightRuntime) {
  enemy.atkMin = Math.max(1, Math.floor(runtime.baseAtkMin * runtime.atkMult));
  enemy.atkMax = Math.max(enemy.atkMin, Math.floor(runtime.baseAtkMax * runtime.atkMult));
  enemy.onHitStatuses = runtime.onHitParty ? [runtime.onHitParty] : [];
}

function applyPhaseModifiers(
  enemy: BossFighterSlice,
  runtime: BossFightRuntime,
  phase: BossPhaseDef,
  log: CombatLogLine[],
  party: BossFighterSlice[],
  rnd: () => number,
) {
  const m = phase.modifiers;
  if (m?.atkMult) {
    runtime.atkMult *= m.atkMult;
    syncEnemyStats(enemy, runtime);
  }
  if (m?.defMult) {
    enemy.def = Math.max(0, Math.floor(runtime.baseDef * m.defMult));
  }
  if (m?.healPctOfMax && m.healPctOfMax > 0) {
    const heal = Math.max(1, Math.floor(enemy.maxHp * m.healPctOfMax));
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    log.push({ t: "heal", side: "enemy", actor: enemy.label, amount: heal, source: "skill", skillName: phase.label });
  }
  if (m?.extraHitChancePct) runtime.extraHitChancePct += m.extraHitChancePct;
  if (m?.healsOnHitPct) runtime.healsOnHitPct = Math.max(runtime.healsOnHitPct, m.healsOnHitPct);
  if (m?.regenPctPerRound) runtime.regenPctPerRound = Math.max(runtime.regenPctPerRound, m.regenPctPerRound);

  const g = phase.gimmick;
  if (g?.onHitParty) {
    runtime.onHitParty = g.onHitParty;
    enemy.onHitStatuses = [g.onHitParty];
  }
  if (g?.everyNRoundsParty) {
    runtime.everyNRoundsParty = g.everyNRoundsParty;
    runtime.everyNRounds = 3;
  }
  if (g?.onEnterParty) {
    for (const fighter of party) {
      if (fighter.hp <= 0) continue;
      for (const spec of g.onEnterParty) {
        applyStatusInstance(fighter, spec, log, rnd, phase.label);
      }
    }
  }
  if (g?.onEnterSelf) {
    for (const spec of g.onEnterSelf) {
      applyStatusInstance(enemy, spec, log, rnd, phase.label);
    }
  }
}

export function checkBossPhaseTransition(input: {
  enemy: BossFighterSlice;
  runtime: BossFightRuntime;
  party: BossFighterSlice[];
  log: CombatLogLine[];
  rnd: () => number;
}): boolean {
  const ratio = input.enemy.hp / Math.max(1, input.enemy.maxHp);
  const nextId = phaseIdForHpRatio(ratio, input.runtime.config);
  if (nextId <= input.runtime.currentPhaseId) return false;

  const phase = input.runtime.config.phases.find((p) => p.id === nextId);
  if (!phase) return false;

  input.runtime.currentPhaseId = nextId;
  applyPhaseModifiers(input.enemy, input.runtime, phase, input.log, input.party, input.rnd);

  input.log.push({
    t: "phase_change",
    phase: nextId,
    label: phase.label,
    flavor: phase.flavor,
    enemyName: input.enemy.label,
  });
  return true;
}

export function tickBossRoundStart(input: {
  enemy: BossFighterSlice;
  runtime: BossFightRuntime;
  party: BossFighterSlice[];
  log: CombatLogLine[];
  rnd: () => number;
}) {
  input.runtime.roundCounter += 1;

  if (input.runtime.regenPctPerRound > 0 && input.enemy.hp > 0) {
    const heal = Math.max(1, Math.floor(input.enemy.maxHp * input.runtime.regenPctPerRound));
    input.enemy.hp = Math.min(input.enemy.maxHp, input.enemy.hp + heal);
    input.log.push({
      t: "heal",
      side: "enemy",
      actor: input.enemy.label,
      amount: heal,
      source: "regen",
      skillName: "재생",
    });
  }

  if (input.runtime.auraEveryRound && input.runtime.auraEveryRound.chancePct > 0) {
    for (const fighter of input.party) {
      if (fighter.hp <= 0) continue;
      applyStatusInstance(fighter, input.runtime.auraEveryRound, input.log, input.rnd, input.enemy.label);
    }
  }

  if (
    input.runtime.everyNRoundsParty &&
    input.runtime.everyNRounds > 0 &&
    input.runtime.roundCounter % input.runtime.everyNRounds === 0
  ) {
    for (const fighter of input.party) {
      if (fighter.hp <= 0) continue;
      applyStatusInstance(fighter, input.runtime.everyNRoundsParty, input.log, input.rnd, input.enemy.label);
    }
  }
}

export function applyBossHealOnHit(
  attacker: BossFighterSlice & { bossRuntime?: BossFightRuntime | null },
  damage: number,
  log: CombatLogLine[],
) {
  const runtime = attacker.bossRuntime;
  if (!runtime || runtime.healsOnHitPct <= 0 || damage <= 0) return;
  const heal = Math.max(1, Math.floor((damage * runtime.healsOnHitPct) / 100));
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
  log.push({
    t: "heal",
    side: "enemy",
    actor: attacker.label,
    amount: heal,
    source: "lifesteal",
    skillName: "흡식",
  });
}

/** ATB — 공속 배율 */
export function bossPhaseAttackSpeedMult(phaseId: number): number {
  if (phaseId >= 3) return 1.15;
  if (phaseId >= 2) return 1.25;
  return 1;
}

/** ATB — 페이즈 진입 시 공격력 배율 (누적 아님, 단계별) */
export function bossPhaseAtkMultForAtb(phaseId: number, config: BossFightConfig): number {
  let mult = 1;
  for (const p of config.phases) {
    if (p.id > phaseId) break;
    if (p.modifiers?.atkMult) mult *= p.modifiers.atkMult;
  }
  return mult;
}
