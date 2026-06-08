import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | Prisma.DefaultPrismaClient;

export async function recordDungeonGoldEarn(
  db: Db,
  input: { userId: string; dungeonId: string; floor: number; amount: number },
) {
  const amount = Math.max(0, Math.floor(input.amount));
  if (amount <= 0) return;
  await db.dungeonGoldEarn.create({
    data: {
      userId: input.userId,
      dungeonId: input.dungeonId,
      floor: Math.max(1, Math.floor(input.floor)),
      amount,
    },
  });
}

export async function grantDungeonFloorGold(
  db: Db,
  input: { userId: string; dungeonId: string; floor: number; amount: number },
) {
  const amount = Math.max(0, Math.floor(input.amount));
  if (amount <= 0) return;

  await db.wallet.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, goldAvailable: amount },
    update: { goldAvailable: { increment: amount } },
  });
  await recordDungeonGoldEarn(db, { ...input, amount });
}

/** PUSH_LUCK 정산·클리어 시 누적 골드 일괄 지급 */
export async function grantDungeonRunGold(
  db: Db,
  input: { userId: string; dungeonId: string; amount: number },
) {
  await grantDungeonFloorGold(db, { ...input, floor: 0, amount: input.amount });
}
