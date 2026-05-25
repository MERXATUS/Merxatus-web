import type { MinionJobType } from "@prisma/client";

import {
  enabledJobsForCategory,
  loadMinionCsvBundle,
  type MinionCsvKind,
  type MinionRecruitTicketDef,
  UNIFIED_MINION_RECRUIT_ITEM_ID,
} from "@/server/minionCsvData";

export type MinionRecruitBirth = {
  level: number;
  jobType: MinionJobType;
  ticket: MinionRecruitTicketDef;
  minionKind: MinionCsvKind;
};

export type RecruitCandidate = {
  jobType: MinionJobType;
  labelKo: string;
};

function sampleUniqueJobs(jobs: MinionJobType[], count: number, rnd: () => number): MinionJobType[] {
  const pool = [...jobs];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rnd() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, n);
}

function resolveCategory(input: {
  ticket: MinionRecruitTicketDef;
  category?: MinionCsvKind | null;
}): MinionCsvKind {
  if (input.category) return input.category;
  throw new Error("RECRUIT_CATEGORY_REQUIRED");
}

function resolveJobPool(
  bundle: Awaited<ReturnType<typeof loadMinionCsvBundle>>,
  category: MinionCsvKind,
): MinionJobType[] {
  const jobs = enabledJobsForCategory(bundle, category).map((j) => j.jobId);
  if (jobs.length === 0) throw new Error("RECRUIT_JOB_POOL_EMPTY");
  return jobs;
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
  const jobPool = resolveJobPool(bundle, minionKind);
  const picked = sampleUniqueJobs(jobPool, ticket.pickCount, rnd);
  const labelByJob = new Map(
    enabledJobsForCategory(bundle, minionKind).map((j) => [j.jobId, j.labelKo] as const),
  );

  return {
    ticket,
    minionKind,
    candidates: picked.map((jobType) => ({
      jobType,
      labelKo: labelByJob.get(jobType) ?? jobType,
    })),
  };
}

export function buildMinionRecruitBirth(input: {
  ticket: MinionRecruitTicketDef;
  category: MinionCsvKind;
  jobType: MinionJobType;
}): MinionRecruitBirth {
  return {
    level: 1,
    jobType: input.jobType,
    ticket: input.ticket,
    minionKind: input.category,
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
