import { prisma } from "@/server/db";
import { ensureMinionEntitiesForUser } from "@/server/ensureMinionEntitiesForUser";
import { GAME_RULES } from "@/server/gameRules";
import { grantLootToUser } from "@/server/grantLootToUser";

/** 신규 유저 지갑·미니언 인벤토리·튜토리얼용 재료 */
export async function ensureUserBootstrap(userId: string) {
  const existingWallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { userId: true },
  });
  const isNewUser = !existingWallet;

  await prisma.wallet.upsert({
    where: { userId },
    create: { userId, goldAvailable: GAME_RULES.starter.gold, goldLocked: 0 },
    update: {},
  });

  await prisma.minionInventory.upsert({
    where: { userId },
    create: { userId, owned: 0, dungeonOwned: 0 },
    update: {},
  });

  if (isNewUser && GAME_RULES.starter.grantItems.length > 0) {
    await grantLootToUser(
      prisma,
      userId,
      GAME_RULES.starter.grantItems.map((row) => ({ itemId: row.itemId, qty: row.qty })),
    ).catch((e) => {
      console.warn("[ensureUserBootstrap] starter grantItems", e);
    });
  }

  await ensureMinionEntitiesForUser(userId, { force: true }).catch((e) => {
    console.warn("[ensureUserBootstrap] ensureMinionEntitiesForUser", e);
  });
}
