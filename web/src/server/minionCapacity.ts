import type { Prisma, PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";

type DbMinion = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;
type DbInv = Pick<PrismaClient, "minion" | "minionInventory"> | Prisma.TransactionClient;

export const MAX_DUNGEON_MINIONS = GAME_RULES.minion.maxDungeonOwned;

export function dungeonMinionWhere(userId: string): Prisma.MinionWhereInput {
  return { userId };
}

export async function countDungeonMinions(db: DbMinion, userId: string) {
  return db.minion.count({ where: dungeonMinionWhere(userId) });
}

export async function syncMinionInventoryCaps(db: DbInv, userId: string) {
  const dungeonCount = await countDungeonMinions(db, userId);
  const dungeonOwned = Math.min(dungeonCount, MAX_DUNGEON_MINIONS);
  const owned = dungeonOwned;

  await db.minionInventory.upsert({
    where: { userId },
    create: { userId, owned, dungeonOwned },
    update: { owned, dungeonOwned },
  });

  return { dungeonCount, dungeonOwned, owned };
}

export function assertCanHatchMinion(dungeonCount: number) {
  if (dungeonCount >= MAX_DUNGEON_MINIONS) throw new Error("MAX_DUNGEON_MINION_OWNED");
}

/** @deprecated assertCanHatchMinion 사용 */
export function assertCanHatchMinionPool(_pool: unknown, _gatherCount: number, dungeonCount: number) {
  assertCanHatchMinion(dungeonCount);
}

/** @deprecated assertCanHatchMinion 사용 */
export function assertCanHatchMinionJob(_jobType: unknown, _gatherCount: number, dungeonCount: number) {
  assertCanHatchMinion(dungeonCount);
}

/** @deprecated assertCanHatchMinion 사용 */
export function assertCanGrantGatherMinion(_gatherCount: number) {
  /* no-op: 수집 풀 제거 */
}

export const MAX_GATHER_MINIONS = 0;

export async function countGatherMinions(_db: DbMinion, _userId: string) {
  return 0;
}

export function gatherMinionWhere(_userId: string): Prisma.MinionWhereInput {
  return { id: "__none__" };
}

export async function countGatherWorkshopAssignments(
  _db: Pick<PrismaClient, never>,
  _userId: string,
) {
  return 0;
}
