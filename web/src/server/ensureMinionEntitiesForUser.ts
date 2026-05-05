import { prisma } from "@/server/db";
import { randomMinionBirthRow, rollMinionGrade, rollMinionJob } from "@/server/minionBirth";
import { createMinionWithBirth } from "@/server/minionInsert";
import { GAME_RULES } from "@/server/gameRules";

/**
 * `MinionInventory.owned`(숫자)와 `Minion`(개별 개체)을 맞춘다.
 * - 던전/무기 장착은 개별 미니언이 필요해서, owned 수만큼 Minion row를 보장한다.
 */
export async function ensureMinionEntitiesForUser(userId: string) {
  const maxOwned = GAME_RULES.minion.maxOwned;

  const inv = await prisma.minionInventory.findUnique({ where: { userId } });
  let owned = Math.min(inv?.owned ?? 1, maxOwned);

  const existingCount = await prisma.minion.count({ where: { userId } });
  if (existingCount > maxOwned) {
    const all = await prisma.minion.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: 500,
    });
    const dropIds = all.slice(maxOwned).map((m) => m.id);
    if (dropIds.length > 0) {
      await prisma.minion.deleteMany({ where: { id: { in: dropIds } } });
    }
  }

  const countAfter = await prisma.minion.count({ where: { userId } });
  owned = Math.min(owned, maxOwned);
  await prisma.minionInventory.upsert({
    where: { userId },
    create: { userId, owned: Math.min(Math.max(countAfter, owned), maxOwned) },
    update: { owned: Math.min(Math.max(countAfter, owned), maxOwned) },
  });

  const existingCount2 = await prisma.minion.count({ where: { userId } });
  const missing = Math.max(0, Math.min(owned, maxOwned) - existingCount2);
  if (missing <= 0) {
    await legacyFix(userId);
    return { ok: true as const, created: 0 };
  }

  const canCreate = Math.min(missing, maxOwned - existingCount2);
  if (canCreate <= 0) {
    await legacyFix(userId);
    return { ok: true as const, created: 0 };
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < canCreate; i++) {
      const row = randomMinionBirthRow();
      await createMinionWithBirth(tx, { userId, ...row });
    }
  });

  await legacyFix(userId);

  return { ok: true as const, created: canCreate };
}

async function legacyFix(userId: string) {
  const legacy = await prisma.minion.findMany({
    where: { userId, jobType: "UNASSIGNED" },
    select: { id: true },
    take: 100,
  });
  for (const m of legacy) {
    const jobType = rollMinionJob();
    const grade = rollMinionGrade();
    await prisma.$executeRaw`
      UPDATE "Minion" SET "jobType" = ${jobType}, "grade" = ${grade} WHERE "id" = ${m.id}
    `;
  }
}

