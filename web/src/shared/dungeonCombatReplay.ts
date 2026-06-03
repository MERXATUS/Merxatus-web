import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
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

export type BattleFloatDamage = {
  id: string;
  targetId: string;
  damage: number;
  side: "party" | "enemy";
};

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
  };
}

function findFighter(fighters: BattleFighterView[], label: string, side?: BattleFighterView["side"]) {
  const pool = side ? fighters.filter((f) => f.side === side) : fighters;
  return pool.find((f) => f.label === label) ?? null;
}

function lineDelay(line: CombatLogLine): number {
  switch (line.t) {
    case "floor_start":
      return 520;
    case "hit":
      return 260;
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
      };
    }
    case "hit": {
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
        });
      }
      return {
        ...frame,
        fighters,
        floaters,
        actingId: actor?.id ?? null,
        hitTargetId: target?.id ?? null,
        banner: null,
        lastLog: `${line.actor} → ${line.target}  ${line.damage}`,
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
        lastLog: `${line.name} 처치!`,
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
        lastLog: line.outcome === "WIN" ? "✦ 층 클리어!" : "✦ 전멸…",
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
