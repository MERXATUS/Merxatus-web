import { prisma } from "@/server/db";

/** 신규 유저 지갑·미니언 인벤토리 등 최초 데이터 */
export async function ensureUserBootstrap(userId: string) {
  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, goldAvailable: 1000, goldLocked: 0 },
    update: {},
  });

  await prisma.minionInventory.upsert({
    where: { userId },
    create: { userId, owned: 0, dungeonOwned: 0 },
    update: {},
  });
}
