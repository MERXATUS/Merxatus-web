import { prisma, runPrismaTransaction } from "@/server/db";
import type { MinionJobType } from "@prisma/client";
import { createMinionWithBirth } from "@/server/minionInsert";
import { GATHER_JOB_TYPES } from "@/server/minionJobs";
import {
  countDungeonMinions,
  countGatherMinions,
  dungeonMinionWhere,
  gatherMinionWhere,
  MAX_DUNGEON_MINIONS,
  MAX_GATHER_MINIONS,
  syncMinionInventoryCaps,
} from "@/server/minionCapacity";

async function cleanupLegacyProcessMinions(userId: string) {
  const processWs = await prisma.workshopInstance.findMany({
    where: { userId, workshopType: { kind: "PROCESS" } },
    select: { id: true },
  });
  const ids = processWs.map((w) => w.id);
  if (ids.length) {
    await prisma.workshopAssignment.deleteMany({ where: { workshopId: { in: ids } } });
    await prisma.workshopInstance.updateMany({
      where: { id: { in: ids } },
      data: { minionCount: 0 },
    });
  }
  await prisma.minion.updateMany({
    where: {
      userId,
      jobType: { in: ["BLACKSMITH", "JEWELER", "ALCHEMIST", "COOK", "SCRAPPER"] },
    },
    data: { jobType: "UNASSIGNED" },
  });
}

async function trimPoolExcess(
  userId: string,
  where: ReturnType<typeof gatherMinionWhere>,
  max: number,
) {
  const count = await prisma.minion.count({ where });
  if (count <= max) return;

  const excess = count - max;
  const all = await prisma.minion.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workshopAssignments: { select: { id: true }, take: 1 },
      dungeonPartyMemberships: { select: { id: true }, take: 1 },
    },
    take: 500,
  });

  const dropIds: string[] = [];
  for (const m of all) {
    if (dropIds.length >= excess) break;
    if (m.workshopAssignments.length > 0 || m.dungeonPartyMemberships.length > 0) continue;
    dropIds.push(m.id);
  }
  if (dropIds.length < excess) {
    for (const m of all) {
      if (dropIds.length >= excess) break;
      if (dropIds.includes(m.id)) continue;
      dropIds.push(m.id);
    }
  }
  if (dropIds.length > 0) {
    await prisma.minion.deleteMany({ where: { id: { in: dropIds } } });
  }
}

const ensureCooldownMs = 60_000;
const lastEnsureAt = new Map<string, number>();

/**
 * 수집·던전 미니언 풀별 상한을 맞추고, 신규 유저는 수집 미니언 1마리를 보장한다.
 */
export async function ensureMinionEntitiesForUser(userId: string, options?: { force?: boolean }) {
  const now = Date.now();
  const last = lastEnsureAt.get(userId) ?? 0;
  if (!options?.force && now - last < ensureCooldownMs) {
    return { ok: true as const, created: 0, skipped: true as const };
  }
  lastEnsureAt.set(userId, now);

  await cleanupLegacyProcessMinions(userId);

  await trimPoolExcess(userId, gatherMinionWhere(userId), MAX_GATHER_MINIONS);
  await trimPoolExcess(userId, dungeonMinionWhere(userId), MAX_DUNGEON_MINIONS);

  const gatherCount = await countGatherMinions(prisma, userId);
  const dungeonCount = await countDungeonMinions(prisma, userId);

  let created = 0;
  if (gatherCount === 0 && dungeonCount === 0) {
    await runPrismaTransaction(async (tx) => {
      const jobs = [...GATHER_JOB_TYPES] as MinionJobType[];
      const row = {
        level: 1,
        jobType: jobs[Math.floor(Math.random() * jobs.length)]!,
      };
      await createMinionWithBirth(tx, { userId, ...row });
    });
    created = 1;
  }

  await syncMinionInventoryCaps(prisma, userId);
  await legacyFix(userId);

  return { ok: true as const, created };
}

async function legacyFix(userId: string) {
  const legacy = await prisma.minion.findMany({
    where: { userId, jobType: "UNASSIGNED" },
    select: { id: true },
    take: 100,
  });
  for (const m of legacy) {
    const jobs = [...GATHER_JOB_TYPES] as MinionJobType[];
    const jobType = jobs[Math.floor(Math.random() * jobs.length)]!;
    await prisma.minion.update({
      where: { id: m.id },
      data: { jobType },
    });
  }
  await syncMinionInventoryCaps(prisma, userId);
}
