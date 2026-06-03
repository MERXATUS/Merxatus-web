import {
  loadMinionCsvBundle,
  type MinionCsvKind,
  type MinionRecruitTicketDef,
  UNIFIED_MINION_RECRUIT_ITEM_ID,
} from "@/server/minionCsvData";
import { rollMinionBaseStats, type MinionBaseStats } from "@/shared/minionBaseStats";
import { previewRecruitCandidateLabel } from "@/shared/minionDerivedClass";

export type MinionRecruitBirth = {
  level: number;
  baseStats: MinionBaseStats;
  ticket: MinionRecruitTicketDef;
  minionKind: MinionCsvKind;
};

export type RecruitCandidate = {
  candidateIndex: number;
  labelKo: string;
  baseStats: MinionBaseStats;
};

function resolveCategory(input: {
  ticket: MinionRecruitTicketDef;
  category?: MinionCsvKind | null;
}): MinionCsvKind {
  if (input.category === "DUNGEON") return "DUNGEON";
  return "DUNGEON";
}

export async function rollRecruitCandidates(
  itemId: string,
  options: { category: MinionCsvKind; rnd?: () => number },
): Promise<{
  ticket: MinionRecruitTicketDef;
  minionKind: MinionCsvKind;
  candidates: RecruitCandidate[];
}> {
  const rnd = options.rnd ?? Math.random;
  const bundle = await loadMinionCsvBundle();
  const ticket = bundle.ticketsByItemId.get(itemId);
  if (!ticket) throw new Error("INVALID_RECRUIT_ITEM");

  const minionKind = resolveCategory({ ticket, category: options.category });
  const count = Math.max(1, ticket.pickCount);
  const candidates: RecruitCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const baseStats = rollMinionBaseStats(rnd);
    candidates.push({
      candidateIndex: i,
      labelKo: previewRecruitCandidateLabel(baseStats),
      baseStats,
    });
  }

  return { ticket, minionKind, candidates };
}

export function buildMinionRecruitBirth(input: {
  ticket: MinionRecruitTicketDef;
  category: MinionCsvKind;
  baseStats: MinionBaseStats;
}): MinionRecruitBirth {
  return {
    level: 1,
    baseStats: input.baseStats,
    ticket: input.ticket,
    minionKind: "DUNGEON",
  };
}

export async function listRecruitTicketItemIds(): Promise<string[]> {
  const bundle = await loadMinionCsvBundle();
  return [...bundle.ticketsByItemId.keys()].sort();
}

export async function isRecruitTicketItemId(itemId: string): Promise<boolean> {
  const bundle = await loadMinionCsvBundle();
  return bundle.ticketsByItemId.has(itemId);
}

export { UNIFIED_MINION_RECRUIT_ITEM_ID };
