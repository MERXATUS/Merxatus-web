import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { kstDayKey } from "@/server/kst";
import { botUsernamesForCount } from "@/server/botRuntimeConfig";

/**
 * `market_bot_1` … `market_bot_{count}` 유저와 지갑·예산·시드 인벤을 upsert.
 * 시드/관리자 API에서 공통 사용.
 */
export async function ensureBotUsers(count: number) {
  const n = Math.min(100, Math.max(1, Math.floor(count)));
  const dayKey = kstDayKey();
  const botUsernames = botUsernamesForCount(n);
  const rules = GAME_RULES.bots;

  // 봇 수×스택 upsert를 한 트랜잭션에 넣으면 P2028(트랜잭션 만료)이 날 수 있음
  const botIds: string[] = [];
  for (const username of botUsernames) {
    const bot = await prisma.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });
    botIds.push(bot.id);

    await prisma.minionInventory.upsert({
      where: { userId: bot.id },
      create: { userId: bot.id, owned: 0, dungeonOwned: 0 },
      update: {},
    });

    await prisma.wallet.upsert({
      where: { userId: bot.id },
      create: { userId: bot.id, goldAvailable: rules.seedWalletGold, goldLocked: 0 },
      update: { goldAvailable: rules.seedWalletGold, goldLocked: 0 },
    });

    await prisma.botBudget.upsert({
      where: { userId: bot.id },
      create: {
        userId: bot.id,
        dayKey,
        remainingBuyBudget: rules.dailyBuyBudgetGold,
      },
      update: {
        dayKey,
        remainingBuyBudget: rules.dailyBuyBudgetGold,
      },
    });

    for (const st of rules.seedStacks) {
      await prisma.item.upsert({
        where: { id: st.itemId },
        create: {
          id: st.itemId,
          name: st.itemId,
          category: "재료",
          tradable: true,
          grade: 1,
        },
        update: {},
      });
      await prisma.inventoryStack.upsert({
        where: { userId_itemId: { userId: bot.id, itemId: st.itemId } },
        create: { userId: bot.id, itemId: st.itemId, quantity: st.quantity },
        update: { quantity: st.quantity },
      });
    }
  }

  const botsFound = await prisma.user.findMany({
    where: { username: { in: botUsernames } },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });

  if (botsFound.length !== n) {
    throw new Error(
      `BOT_COUNT_MISMATCH: 기대 ${n}명, 실제 ${botsFound.length}명 (${botsFound.map((u) => u.username).join(", ") || "없음"})`,
    );
  }

  return {
    botIds,
    botUsernames,
    botsFound: botsFound.length,
    botsExpected: n,
  };
}
