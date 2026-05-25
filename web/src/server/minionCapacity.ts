import type { MinionJobType, Prisma, PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import { DUNGEON_JOB_TYPES, GATHER_JOB_TYPES, isDungeonMinionJob } from "@/server/minionJobs";

type DbMinion = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;
type DbInv = Pick<PrismaClient, "minion" | "minionInventory"> | Prisma.TransactionClient;
type DbAssign = Pick<PrismaClient, "workshopAssignment"> | Prisma.TransactionClient;

export const MAX_GATHER_MINIONS = GAME_RULES.minion.maxGatherOwned;
export const MAX_DUNGEON_MINIONS = GAME_RULES.minion.maxDungeonOwned;

/** 수집 풀: 수집 직업 + 부트스트랩 전 UNASSIGNED */
export function gatherMinionWhere(userId: string): Prisma.MinionWhereInput {
  return {
    userId,
    OR: [{ jobType: { in: [...GATHER_JOB_TYPES] } }, { jobType: "UNASSIGNED" }],
  };
}

export function dungeonMinionWhere(userId: string): Prisma.MinionWhereInput {
  return {
    userId,
    jobType: { in: [...DUNGEON_JOB_TYPES] },
  };
}

export async function countGatherMinions(db: DbMinion, userId: string) {
  return db.minion.count({ where: gatherMinionWhere(userId) });
}

export async function countDungeonMinions(db: DbMinion, userId: string) {
  return db.minion.count({ where: dungeonMinionWhere(userId) });
}

export async function countGatherWorkshopAssignments(db: DbAssign, userId: string) {
  return db.workshopAssignment.count({
    where: {
      workshop: { userId },
      minion: gatherMinionWhere(userId),
    },
  });
}

/** 인벤 수치를 실제 보유 수에 맞춘다 (owned = 수집 + 던전 합계, 레거시 호환) */
export async function syncMinionInventoryCaps(db: DbInv, userId: string) {
  const gatherCount = await countGatherMinions(db, userId);
  const dungeonCount = await countDungeonMinions(db, userId);
  const gatherOwned = Math.min(gatherCount, MAX_GATHER_MINIONS);
  const dungeonOwned = Math.min(dungeonCount, MAX_DUNGEON_MINIONS);
  const owned = gatherOwned + dungeonOwned;

  await db.minionInventory.upsert({
    where: { userId },
    create: { userId, owned, gatherOwned, dungeonOwned },
    update: { owned, gatherOwned, dungeonOwned },
  });

  return { gatherCount, dungeonCount, gatherOwned, dungeonOwned, owned };
}

export function assertCanHatchMinionJob(jobType: MinionJobType, gatherCount: number, dungeonCount: number) {
  if (isDungeonMinionJob(jobType)) {
    if (dungeonCount >= MAX_DUNGEON_MINIONS) throw new Error("MAX_DUNGEON_MINION_OWNED");
    return;
  }
  if (gatherCount >= MAX_GATHER_MINIONS) throw new Error("MAX_GATHER_MINION_OWNED");
}

export function assertCanGrantGatherMinion(gatherCount: number) {
  if (gatherCount >= MAX_GATHER_MINIONS) throw new Error("MAX_GATHER_MINION_OWNED");
}
