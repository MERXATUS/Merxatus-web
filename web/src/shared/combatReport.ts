import type { AtbCombatEvent } from "@/shared/atbCombat";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";

export type CombatReportFighterStats = {
  fighterId: string;
  label: string;
  side: "party" | "enemy";
  dealt: number;
  taken: number;
  healed: number;
  kills: number;
};

export type CombatReport = {
  durationMs: number;
  outcome: "WIN" | "LOSS";
  fighters: CombatReportFighterStats[];
};

function ensureFighter(
  map: Map<string, CombatReportFighterStats>,
  id: string,
  label: string,
  side: "party" | "enemy",
) {
  if (!map.has(id)) {
    map.set(id, { fighterId: id, label, side, dealt: 0, taken: 0, healed: 0, kills: 0 });
  }
  return map.get(id)!;
}

export function buildCombatReportFromAtbEvents(input: {
  events: AtbCombatEvent[];
  fighters: Array<{ id: string; label: string; side: "party" | "enemy" }>;
  durationMs: number;
  outcome: "WIN" | "LOSS";
}): CombatReport {
  const map = new Map<string, CombatReportFighterStats>();
  for (const f of input.fighters) ensureFighter(map, f.id, f.label, f.side);

  for (const ev of input.events) {
    if (ev.kind === "hit" || ev.kind === "extra") {
      const actor = map.get(ev.actorId);
      const target = ev.targetId ? map.get(ev.targetId) : undefined;
      const amt = ev.amount ?? 0;
      if (actor) actor.dealt += amt;
      if (target) target.taken += amt;
    } else if (ev.kind === "heal") {
      const actor = map.get(ev.actorId);
      if (actor) actor.healed += ev.amount ?? 0;
    } else if (ev.kind === "ko") {
      const actor = map.get(ev.actorId);
      if (actor) actor.kills += 1;
    }
  }

  return {
    durationMs: input.durationMs,
    outcome: input.outcome,
    fighters: [...map.values()].sort((a, b) => b.dealt - a.dealt),
  };
}

export function buildCombatReportFromCombatLog(input: {
  log: CombatLogLine[];
  partyLabels: string[];
  enemyLabel: string;
  durationMs?: number;
  outcome: "WIN" | "LOSS";
}): CombatReport {
  const map = new Map<string, CombatReportFighterStats>();
  for (const label of input.partyLabels) {
    ensureFighter(map, label, label, "party");
  }
  ensureFighter(map, input.enemyLabel, input.enemyLabel, "enemy");

  for (const line of input.log) {
    if (line.t === "hit") {
      const actor = ensureFighter(map, line.actor, line.actor, line.side);
      const targetSide = line.side === "party" ? "enemy" : "party";
      const targetLabel = line.target;
      const target = ensureFighter(map, targetLabel, targetLabel, targetSide);
      actor.dealt += line.damage;
      target.taken += line.damage;
    } else if (line.t === "heal") {
      const actor = ensureFighter(map, line.actor, line.actor, line.side);
      actor.healed += line.amount;
    } else if (line.t === "ko") {
      ensureFighter(map, line.name, line.name, line.side === "party" ? "party" : "enemy");
    }
  }

  return {
    durationMs: input.durationMs ?? 0,
    outcome: input.outcome,
    fighters: [...map.values()].sort((a, b) => b.dealt - a.dealt),
  };
}

export function formatCombatDuration(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}
