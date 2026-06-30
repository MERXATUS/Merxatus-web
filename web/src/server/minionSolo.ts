import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";

type SoloDb = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;

/** 유저의 유일한 미니언 id — 없으면 생성 후 반환 */
export async function resolveSoloMinionId(db: SoloDb, userId: string): Promise<string> {
  await ensureMinionEntitiesForUser(userId).catch(() => {});

  const first = await db.minion.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!first) throw new Error("MINION_NOT_FOUND");
  return first.id;
}

export async function resolveSoloMinionIds(db: SoloDb, userId: string, max = 1): Promise<string[]> {
  const id = await resolveSoloMinionId(db, userId);
  return [id].slice(0, Math.max(1, max));
}
