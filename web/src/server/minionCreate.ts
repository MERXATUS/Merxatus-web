import type { Prisma, PrismaClient } from "@prisma/client";
import {
  assertCanHatchMinion,
  countDungeonMinions,
  MAX_DUNGEON_MINIONS,
} from "@/server/minionCapacity";
import { rollMinionBaseStats } from "@/shared/minionBaseStats";
import { previewRecruitCandidateLabel } from "@/shared/minionDerivedClass";
import {
  MINION_ALT_CREATE_LEVEL,
  MINION_CREATE_CANDIDATE_COUNT,
  type MinionCreateCandidate,
  type MinionCreateEligibility,
} from "@/shared/minionCreate";

type DbMinion = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;

export async function highestMinionLevel(db: DbMinion, userId: string) {
  const agg = await db.minion.aggregate({
    where: { userId },
    _max: { level: true },
  });
  return Math.max(0, Math.floor(agg._max.level ?? 0));
}

export async function getMinionCreateEligibility(db: DbMinion, userId: string): Promise<MinionCreateEligibility> {
  const minionCount = await countDungeonMinions(db, userId);
  const highestLevel = await highestMinionLevel(db, userId);
  const maxOwned = MAX_DUNGEON_MINIONS;
  const requiredLevel = MINION_ALT_CREATE_LEVEL;
  const isFirstSlot = minionCount === 0;

  if (minionCount >= maxOwned) {
    return {
      canCreate: false,
      minionCount,
      maxOwned,
      highestLevel,
      requiredLevel,
      isFirstSlot,
      error: "MAX_DUNGEON_MINION_OWNED",
    };
  }

  if (!isFirstSlot && highestLevel < requiredLevel) {
    return {
      canCreate: false,
      minionCount,
      maxOwned,
      highestLevel,
      requiredLevel,
      isFirstSlot,
      error: "MINION_CREATE_LEVEL_REQUIRED",
    };
  }

  return {
    canCreate: true,
    minionCount,
    maxOwned,
    highestLevel,
    requiredLevel,
    isFirstSlot,
  };
}

export async function assertCanCreateMinion(db: DbMinion, userId: string) {
  const eligibility = await getMinionCreateEligibility(db, userId);
  if (!eligibility.canCreate) {
    throw new Error(eligibility.error ?? "MINION_CREATE_BLOCKED");
  }
  const dungeonCount = await countDungeonMinions(db, userId);
  assertCanHatchMinion(dungeonCount);
}

export function rollMinionCreateCandidates(rnd: () => number = Math.random): MinionCreateCandidate[] {
  const count = MINION_CREATE_CANDIDATE_COUNT;
  const candidates: MinionCreateCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const baseStats = rollMinionBaseStats(rnd);
    candidates.push({
      candidateIndex: i,
      labelKo: previewRecruitCandidateLabel(baseStats),
      baseStats,
    });
  }
  return candidates;
}
