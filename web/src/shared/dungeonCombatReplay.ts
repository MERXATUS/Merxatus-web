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

export type CombatFeedTone = "neutral" | "crit" | "extra" | "heal" | "block";

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

function lineDelay(line: CombatLogLine): number {
  switch (line.t) {
    case "floor_start":
      return 520;
    case "skill":
      return 520;
    case "hit":
      return line.kind === "crit" ? 380 : line.kind === "extra" ? 240 : 260;
    case "block":
      return 300;
    case "heal":
      return 240;
    case "ko":
      return 380;
    case "result":
      return 900;
    default:
      return 200;
  }
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
        lastLog: `${line.actor} · ${line.skillName}!`,
        lastLogTone: "neutral",
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
      const blocker = findFighter(fighters, line.actor, "party");
      if (blocker) {
        floaters.push({
          id: `f${floaterSeq}`,
          targetId: blocker.id,
          damage: 0,
          side: "party",
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
        lastLog: `${line.actor} 막기! (${line.attacker})`,
        lastLogTone: "block",
        lastSfx: "block",
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
      return {
        ...frame,
        fighters,
        floaters,
        actingId: healer?.id ?? null,
        hitTargetId: healer?.id ?? null,
        banner: null,
        skillBanner: null,
        skillActor: null,
        lastLog: `${line.actor} 흡혈 +${line.amount} HP`,
        lastLogTone: "heal",
        lastSfx: "heal",
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

export { lineDelay };

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
