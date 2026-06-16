import { COMBAT_STATUS_LABEL } from "@/shared/combatStatusLabels";
import type { CombatHitKind, CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import type { CombatPortraitView } from "@/shared/combatPortrait";

export type BattleFighterView = {
  id: string;
  label: string;
  side: "party" | "enemy";
  hp: number;
  maxHp: number;
  dead: boolean;
  portrait?: CombatPortraitView;
};

export type BattleFloaterKind = "damage" | "heal" | "block";

export type BattleFloatDamage = {
  id: string;
  targetId: string;
  damage: number;
  side: "party" | "enemy";
  kind?: BattleFloaterKind;
  hitKind?: CombatHitKind;
};

export type CombatFeedTone = "neutral" | "crit" | "extra" | "heal" | "block" | "skill";

export type BattleArenaFrame = {
  floor: number;
  enemyName: string;
  fighters: BattleFighterView[];
  floaters: BattleFloatDamage[];
  actingId: string | null;
  hitTargetId: string | null;
  banner: string | null;
  outcome: "WIN" | "LOSS" | null;
  lastLog: string | null;
  lastLogTone: CombatFeedTone;
  lastSfx: "hit" | "crit" | "extra" | "heal" | "block" | "skill" | null;
  hitFlash: CombatHitKind | "block" | null;
  skillBanner: string | null;
  skillActor: string | null;
};

export function initBattleArena(replay: DungeonCombatReplay): BattleArenaFrame {
  const fighters: BattleFighterView[] = [
    ...replay.partyBefore.map((p) => ({
      id: p.minionId,
      label: p.label,
      side: "party" as const,
      hp: p.hp,
      maxHp: p.maxHp,
      dead: p.hp <= 0,
      portrait: p.portrait,
    })),
    {
      id: "enemy_0",
      label: replay.enemy.name,
      side: "enemy",
      hp: replay.enemy.maxHp,
      maxHp: replay.enemy.maxHp,
      dead: false,
      portrait: replay.enemy.portrait,
    },
  ];
  return {
    floor: replay.floor,
    enemyName: replay.enemy.name,
    fighters,
    floaters: [],
    actingId: null,
    hitTargetId: null,
    banner: `${replay.floor}층 · ${replay.enemy.name}`,
    outcome: null,
    lastLog: null,
    lastLogTone: "neutral",
    lastSfx: null,
    hitFlash: null,
    skillBanner: null,
    skillActor: null,
  };
}

function findFighter(fighters: BattleFighterView[], label: string, side?: BattleFighterView["side"]) {
  const pool = side ? fighters.filter((f) => f.side === side) : fighters;
  return pool.find((f) => f.label === label) ?? null;
}

function hitKindLabel(kind: CombatHitKind | undefined): string {
  if (kind === "crit") return " 치명!";
  if (kind === "extra") return " 추가타!";
  return "";
}

/** 전투 재생 한 줄당 대기(ms). normal 기준 — slow/fast 배율 적용, skip은 0 */
export type CombatPlaybackSpeed = "slow" | "normal" | "fast" | "skip";

export const COMBAT_PLAYBACK_SPEED_OPTIONS = [
  { id: "slow" as const, label: "느림" },
  { id: "normal" as const, label: "보통" },
  { id: "fast" as const, label: "빠름" },
];

const PLAYBACK_SPEED_KEY = "merxatus_combat_playback_speed";

export function loadCombatPlaybackSpeed(): Exclude<CombatPlaybackSpeed, "skip"> {
  if (typeof window === "undefined") return "normal";
  try {
    const v = localStorage.getItem(PLAYBACK_SPEED_KEY);
    if (v === "slow" || v === "normal" || v === "fast") return v;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function saveCombatPlaybackSpeed(speed: Exclude<CombatPlaybackSpeed, "skip">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLAYBACK_SPEED_KEY, speed);
  } catch {
    /* ignore */
  }
}

function playbackDelayMult(speed: CombatPlaybackSpeed): number {
  switch (speed) {
    case "slow":
      return 1.7;
    case "fast":
      return 0.52;
    case "skip":
      return 0;
    default:
      return 1;
  }
}

export function combatLogLineText(line: CombatLogLine): string | null {
  switch (line.t) {
    case "floor_start":
      return `${line.floor}층 · ${line.enemyName}`;
    case "skill":
      return `⚔ ${line.actor} · ${line.skillName}!`;
    case "hit": {
      const kindSuffix = hitKindLabel(line.kind);
      return `${line.actor} → ${line.target}  ${line.damage}${kindSuffix}`;
    }
    case "block":
      return line.skillName
        ? `🛡 ${line.actor} · ${line.skillName}! (${line.attacker})`
        : `${line.actor} 막기! (${line.attacker})`;
    case "evade":
      return line.skillName
        ? `💨 ${line.actor} · ${line.skillName}! (${line.attacker})`
        : `${line.actor} 회피! (${line.attacker})`;
    case "heal":
      if (line.source === "lifesteal") return `${line.actor} 흡혈 +${line.amount} HP`;
      if (line.source === "skill" && line.skillName) {
        return `✨ ${line.actor} · ${line.skillName} +${line.amount} HP`;
      }
      return `${line.actor} +${line.amount} HP 회복`;
    case "buff":
      return line.skillName ? `◆ ${line.actor} · ${line.skillName} — ${line.text}` : `◆ ${line.actor} · ${line.text}`;
    case "ko":
      return `${line.name} 처치!`;
    case "status": {
      const label = COMBAT_STATUS_LABEL[line.status] ?? line.status;
      if (line.action === "apply") return `${line.actor} · ${label}`;
      if (line.action === "tick") return `${line.actor} · ${label} ${line.amount ?? 0}`;
      if (line.action === "skip") return `${line.actor} · ${label} (행동 불가)`;
      return `${line.actor} · ${label} 해제`;
    }
    case "counter":
      return `${line.actor} 반격 → ${line.target}  ${line.damage}`;
    case "result":
      return line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸…";
    default:
      return null;
  }
}

export function combatLogLineTone(line: CombatLogLine): CombatFeedTone {
  switch (line.t) {
    case "skill":
    case "buff":
      return "skill";
    case "hit":
      if (line.kind === "crit") return "crit";
      if (line.kind === "extra") return "extra";
      return "neutral";
    case "block":
    case "evade":
      return line.skillName ? "skill" : "block";
    case "heal":
      return line.source === "lifesteal" ? "heal" : line.source === "skill" ? "skill" : "heal";
    default:
      return "neutral";
  }
}

function baseLineDelay(line: CombatLogLine): number {
  switch (line.t) {
    case "floor_start":
      return 580;
    case "skill":
      return 520;
    case "buff":
      return 360;
    case "hit":
      return line.kind === "crit" ? 400 : line.kind === "extra" ? 340 : 360;
    case "block":
      return 340;
    case "evade":
      return 320;
    case "heal":
      return 320;
    case "ko":
      return 460;
    case "status":
      return line.action === "tick" ? 260 : line.action === "skip" ? 320 : 240;
    case "counter":
      return 340;
    case "result":
      return 800;
    default:
      return 280;
  }
}

function lineDelay(line: CombatLogLine, speed: CombatPlaybackSpeed = "normal"): number {
  const mult = playbackDelayMult(speed);
  if (mult <= 0) return 0;
  return Math.round(baseLineDelay(line) * mult);
}

/** 전투 재생 시작 전 짧은 대기(ms) */
export function combatPlaybackLeadInMs(speed: CombatPlaybackSpeed = "normal"): number {
  const mult = playbackDelayMult(speed);
  if (mult <= 0) return 0;
  return Math.round(480 * mult);
}

export function applyCombatLogLine(
  frame: BattleArenaFrame,
  line: CombatLogLine,
  floaterSeq: number,
): BattleArenaFrame {
  const fighters = frame.fighters.map((f) => ({ ...f }));
  const floaters: BattleFloatDamage[] = [];

  switch (line.t) {
    case "floor_start": {
      const enemy = fighters.find((f) => f.side === "enemy");
      const maxHp = line.enemyMaxHp ?? enemy?.maxHp ?? 1;
      if (enemy) {
        enemy.hp = maxHp;
        enemy.maxHp = maxHp;
        enemy.dead = false;
      }
      return {
        ...frame,
        floor: line.floor,
        enemyName: line.enemyName,
        fighters,
        floaters: [],
        actingId: null,
        hitTargetId: null,
        banner: `${line.floor}층 · ${line.enemyName}`,
        lastLog: null,
        lastLogTone: "neutral",
        lastSfx: null,
        hitFlash: null,
        skillBanner: null,
        skillActor: null,
      };
    }
    case "skill": {
      const actor = findFighter(fighters, line.actor, line.side);
      return {
        ...frame,
        fighters,
        floaters: [],
        actingId: actor?.id ?? null,
        hitTargetId: null,
        banner: null,
        skillBanner: line.skillName,
        skillActor: line.actor,
        lastLog: `⚔ ${line.actor} · ${line.skillName}!`,
        lastLogTone: "skill",
        lastSfx: "skill",
        hitFlash: null,
      };
    }
    case "buff": {
      const actor = findFighter(fighters, line.actor, line.side);
      const text = line.skillName ? `◆ ${line.skillName} — ${line.text}` : `◆ ${line.text}`;
      return {
        ...frame,
        fighters,
        floaters: [],
        actingId: actor?.id ?? null,
        hitTargetId: null,
        banner: null,
        skillBanner: line.skillName ?? line.text,
        skillActor: line.actor,
        lastLog: text,
        lastLogTone: "skill",
        lastSfx: "skill",
        hitFlash: null,
      };
    }
    case "hit": {
      const actor = findFighter(fighters, line.actor, line.side);
      const target = findFighter(fighters, line.target, line.side === "party" ? "enemy" : "party");
      const hitKind = line.kind ?? "normal";
      if (target) {
        target.hp = Math.max(0, target.hp - line.damage);
        if (target.hp <= 0) target.dead = true;
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: target.id,
          damage: line.damage,
          side: line.side,
          kind: "damage",
          hitKind,
        });
      }
      const kindSuffix = hitKindLabel(hitKind);
      const tone: CombatFeedTone =
        hitKind === "crit" ? "crit" : hitKind === "extra" ? "extra" : "neutral";
      const sfx: BattleArenaFrame["lastSfx"] =
        hitKind === "crit" ? "crit" : hitKind === "extra" ? "extra" : "hit";
      return {
        ...frame,
        fighters,
        floaters,
        actingId: actor?.id ?? null,
        hitTargetId: target?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog: `${line.actor} → ${line.target}  ${line.damage}${kindSuffix}`,
        lastLogTone: tone,
        lastSfx: sfx,
        hitFlash: hitKind,
      };
    }
    case "block": {
      const blocker = findFighter(fighters, line.actor, line.side);
      if (blocker) {
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: blocker.id,
          damage: 0,
          side: line.side,
          kind: "block",
        });
      }
      return {
        ...frame,
        fighters,
        floaters,
        actingId: blocker?.id ?? null,
        hitTargetId: blocker?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog: line.skillName
          ? `🛡 ${line.actor} · ${line.skillName}! (${line.attacker})`
          : `${line.actor} 막기! (${line.attacker})`,
        lastLogTone: line.skillName ? "skill" : "block",
        lastSfx: line.skillName ? "skill" : "block",
        hitFlash: "block",
      };
    }
    case "evade": {
      const evader = findFighter(fighters, line.actor, line.side);
      if (evader) {
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: evader.id,
          damage: 0,
          side: line.side,
          kind: "block",
        });
      }
      return {
        ...frame,
        fighters,
        floaters,
        actingId: evader?.id ?? null,
        hitTargetId: evader?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog: line.skillName
          ? `💨 ${line.actor} · ${line.skillName}! (${line.attacker})`
          : `${line.actor} 회피! (${line.attacker})`,
        lastLogTone: line.skillName ? "skill" : "block",
        lastSfx: line.skillName ? "skill" : "block",
        hitFlash: "block",
      };
    }
    case "heal": {
      const healer = findFighter(fighters, line.actor, "party");
      if (healer) {
        healer.hp = Math.min(healer.maxHp, healer.hp + line.amount);
        if (healer.hp > 0) healer.dead = false;
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: healer.id,
          damage: line.amount,
          side: "party",
          kind: "heal",
        });
      }
      const healText =
        line.source === "lifesteal"
          ? `${line.actor} 흡혈 +${line.amount} HP`
          : line.source === "skill" && line.skillName
            ? `✨ ${line.actor} · ${line.skillName} +${line.amount} HP`
            : `${line.actor} +${line.amount} HP 회복`;
      return {
        ...frame,
        fighters,
        floaters,
        actingId: healer?.id ?? null,
        hitTargetId: healer?.id ?? null,
        banner: null,
        skillBanner: line.source === "skill" ? line.skillName ?? null : null,
        skillActor: line.source === "skill" ? line.actor : null,
        lastLog: healText,
        lastLogTone: line.source === "skill" ? "skill" : "heal",
        lastSfx: line.source === "skill" ? "skill" : "heal",
        hitFlash: null,
      };
    }
    case "ko": {
      const ko = findFighter(fighters, line.name, line.side);
      if (ko) {
        ko.dead = true;
        ko.hp = 0;
      }
      return {
        ...frame,
        fighters,
        floaters: [],
        actingId: null,
        hitTargetId: ko?.id ?? null,
        skillBanner: null,
        skillActor: null,
        lastLog: `${line.name} 처치!`,
        lastLogTone: "neutral",
        lastSfx: null,
        hitFlash: null,
      };
    }
    case "status": {
      const actor = findFighter(fighters, line.actor, line.side);
      const label = COMBAT_STATUS_LABEL[line.status] ?? line.status;
      let lastLog = `${line.actor} · ${label}`;
      if (line.action === "tick") lastLog = `${line.actor} · ${label} ${line.amount ?? 0}`;
      if (line.action === "skip") lastLog = `${line.actor} · ${label} (행동 불가)`;
      if (line.action === "tick" && actor && line.amount) {
        actor.hp = Math.max(0, actor.hp - line.amount);
        if (actor.hp <= 0) actor.dead = true;
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: actor.id,
          damage: line.amount,
          side: line.side,
          kind: "damage",
        });
      }
      return {
        ...frame,
        fighters,
        floaters,
        actingId: actor?.id ?? null,
        hitTargetId: actor?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog,
        lastLogTone: line.action === "tick" ? "extra" : "neutral",
        lastSfx: line.action === "tick" ? "hit" : null,
        hitFlash: null,
      };
    }
    case "counter": {
      const actor = findFighter(fighters, line.actor, line.side);
      const target = findFighter(fighters, line.target, line.side === "party" ? "enemy" : "party");
      if (target) {
        target.hp = Math.max(0, target.hp - line.damage);
        if (target.hp <= 0) target.dead = true;
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: target.id,
          damage: line.damage,
          side: line.side,
          kind: "damage",
          hitKind: "extra",
        });
      }
      return {
        ...frame,
        fighters,
        floaters,
        actingId: actor?.id ?? null,
        hitTargetId: target?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog: `${line.actor} 반격 → ${line.target}  ${line.damage}`,
        lastLogTone: "extra",
        lastSfx: "extra",
        hitFlash: "extra",
      };
    }
    case "result":
      return {
        ...frame,
        fighters,
        floaters: [],
        actingId: null,
        hitTargetId: null,
        outcome: line.outcome,
        banner: line.outcome === "WIN" ? "층 클리어!" : "전멸…",
        skillBanner: null,
        skillActor: null,
        lastLog: line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸…",
        lastLogTone: "neutral",
        lastSfx: null,
        hitFlash: null,
      };
    default:
      return frame;
  }
}

export { lineDelay, baseLineDelay };

export function partyHpFromArena(fighters: BattleFighterView[]) {
  return fighters
    .filter((f) => f.side === "party")
    .map((f) => ({
      minionId: f.id,
      hp: f.hp,
      maxHp: f.maxHp,
      label: f.label,
    }));
}
