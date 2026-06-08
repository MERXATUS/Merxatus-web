import { prisma, runPrismaTransaction } from "@/server/db";
import { createMinionWithBirth } from "@/server/minionInsert";
import { ensureDefaultSkillLevels } from "@/server/minionSkills";
import { serializeMinionSkillLevels } from "@/shared/minionSkills";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import {
  countDungeonMinions,
  dungeonMinionWhere,
  MAX_DUNGEON_MINIONS,
  syncMinionInventoryCaps,
} from "@/server/minionCapacity";

async function trimPoolExcess(userId: string, max: number) {
  const count = await prisma.minion.count({ where: dungeonMinionWhere(userId) });
  if (count <= max) return;

  const excess = count - max;
  const all = await prisma.minion.findMany({
    where: dungeonMinionWhere(userId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      dungeonPartyMemberships: { select: { id: true }, take: 1 },
      raidPartyMemberships: { select: { id: true }, take: 1 },
      towerPartyMemberships: { select: { id: true }, take: 1 },
    },
    take: 500,
  });

  const dropIds: string[] = [];
  for (const m of all) {
    if (dropIds.length >= excess) break;
    if (
      m.dungeonPartyMemberships.length > 0 ||
      m.raidPartyMemberships.length > 0 ||
      m.towerPartyMemberships.length > 0
    ) {
      continue;
    }
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

/** 던전 미니언 상한을 맞추고, 신규 유저는 모험가 1명을 보장한다. */
export async function ensureMinionEntitiesForUser(userId: string, options?: { force?: boolean }) {
  const now = Date.now();
  const last = lastEnsureAt.get(userId) ?? 0;
  if (!options?.force && now - last < ensureCooldownMs) {
    return { ok: true as const, created: 0, skipped: true as const };
  }
  lastEnsureAt.set(userId, now);

  await trimPoolExcess(userId, MAX_DUNGEON_MINIONS);

  const dungeonCount = await countDungeonMinions(prisma, userId);

  let created = 0;
  if (dungeonCount === 0) {
    await runPrismaTransaction(async (tx) => {
      await createMinionWithBirth(tx, { userId, level: 1 });
    });
    created = 1;
  }

  await syncMinionInventoryCaps(prisma, userId);

  const stale = await prisma.minion.findMany({
    where: { userId, skillLevelsJson: "{}" },
    select: { id: true, promotionTier: true, promotionClass: true, skillLevelsJson: true },
    take: 50,
  });
  for (const row of stale) {
    const combatClass = resolveMinionCombatClass(promotionStateFromRow(row));
    const levels = ensureDefaultSkillLevels(combatClass, {});
    await prisma.minion.update({
      where: { id: row.id },
      data: {
        skillLevelsJson: serializeMinionSkillLevels(levels),
      },
    });
  }

  return { ok: true as const, created };
}
