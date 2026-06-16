import { statsFromPower } from "@/server/dungeonBattler";
import {
  initAtbDuelCombat,
  runAtbCombatToCompletion,
} from "@/server/atbCombatEngine";
import { buildCombatReportFromAtbEvents } from "@/shared/combatReport";
import type { CombatReport } from "@/shared/combatReport";
import type { AtbCombatSnapshot } from "@/shared/atbCombat";
import type { CombatLogLine } from "@/shared/dungeonCombatLog";
import type { CombatantInput } from "@/server/dungeonBattler";

export type PvpAtbBattleResult = {
  outcome: "ATTACKER_WIN" | "DEFENDER_WIN";
  log: CombatLogLine[];
  combatReport: CombatReport;
  snapshots: AtbCombatSnapshot[];
  finalSnapshot: AtbCombatSnapshot;
};

function combatantFullHp(c: CombatantInput) {
  const st = statsFromPower(c.power);
  const bonusHp = Math.max(0, Math.floor(c.bonusHp ?? 0));
  const maxHp = st.maxHp + bonusHp;
  return { hp: maxHp, maxHp };
}

export function resolvePvpAtbCombat(input: {
  attacker: CombatantInput;
  defender: CombatantInput;
  attackerAgility?: number;
  defenderAgility?: number;
}): PvpAtbBattleResult {
  const attackerHp = combatantFullHp(input.attacker);
  const defenderHp = combatantFullHp(input.defender);
  const agiMap = new Map<string, number>([
    [input.attacker.id, input.attackerAgility ?? 0],
    [input.defender.id, input.defenderAgility ?? 0],
  ]);

  const state = initAtbDuelCombat({
    party: [input.attacker],
    partyHp: { [input.attacker.id]: attackerHp },
    agilityByMinionId: agiMap,
    enemyCombatant: input.defender,
    enemyHp: defenderHp,
    enemyAgility: input.defenderAgility ?? 8,
    partyDamageMult: 1,
    enemyTags: { isBoss: false, isAngel: false, isDemon: false },
  });

  const { finalState, events, snapshots } = runAtbCombatToCompletion(state, 100, 2);
  const won = finalState.outcome === "WIN";
  const outcome = won ? "ATTACKER_WIN" : "DEFENDER_WIN";

  const log: CombatLogLine[] = [];
  if (won) {
    log.push({ t: "result", outcome: "WIN" });
  } else {
    log.push({ t: "result", outcome: "LOSS" });
  }

  const combatReport = buildCombatReportFromAtbEvents({
    events: finalState.eventLog,
    fighters: finalState.fighters.map((f) => ({ id: f.id, label: f.label, side: f.side })),
    durationMs: finalState.elapsedMs,
    outcome: won ? "WIN" : "LOSS",
  });

  return {
    outcome,
    log,
    combatReport,
    snapshots,
    finalSnapshot: snapshots[snapshots.length - 1] ?? snapshots[0]!,
  };
}
