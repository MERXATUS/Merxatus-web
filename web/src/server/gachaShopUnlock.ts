import { prisma } from "@/server/db";
import { stageOrderForDungeonId } from "@/shared/dungeonStageProgression";

/** 던전 골드 획득 기록 기준 — 플레이한 적 있는 최고 스테이지 (최소 1) */
export async function getUserHighestDungeonStageOrder(userId: string): Promise<number> {
  const rows = await prisma.dungeonGoldEarn.findMany({
    where: { userId },
    select: { dungeonId: true },
    distinct: ["dungeonId"],
  });

  let best = 1;
  for (const row of rows) {
    const order = stageOrderForDungeonId(row.dungeonId);
    if (order != null) best = Math.max(best, order);
  }
  return best;
}
