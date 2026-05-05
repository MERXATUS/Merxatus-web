import {
  botUsernamesForCount,
  findBotUsersOrdered,
  getConfiguredBotCount,
  parseBotUsernameIndex,
} from "@/server/botRuntimeConfig";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { kstDayKey } from "@/server/kst";

/** 직관적 이상 징후 판별용(튜닝은 여기서). */
const TH = {
  walletWarnVsSeed: 1.75,
  pnlWarnGold24h: 8_000,
  heavyBuyGross1h: 12_000,
  heavyBuyCount1h: 30,
  listingFlood: 25,
  minTradableQtyForSellStall: 3,
  singleBotMarketShareWarn: 0.45,
  allBotsMarketShareWarn: 0.7,
} as const;

type SignalLevel = "info" | "warn" | "bad";

export type BotAdminSignal = {
  level: SignalLevel;
  code: string;
  title: string;
  detail?: string;
};

type TxRow = {
  id: string;
  buyerId: string;
  sellerId: string;
  itemId: string;
  quantity: number;
  saleType: "FIXED" | "AUCTION";
  grossGold: number;
  netGold: number;
  createdAt: Date;
};

function fixedBuyWindow(txs: TxRow[], botId: string, since: Date) {
  let buyGross = 0;
  let buyQty = 0;
  let buyCount = 0;
  for (const t of txs) {
    if (t.createdAt < since) continue;
    if (t.saleType !== "FIXED") continue;
    if (t.buyerId !== botId) continue;
    buyGross += t.grossGold;
    buyQty += t.quantity;
    buyCount += 1;
  }
  return { buyGross, buyQty, buyCount };
}

function fixedSellWindow(txs: TxRow[], botId: string, since: Date) {
  let sellNet = 0;
  let sellQty = 0;
  let sellCount = 0;
  for (const t of txs) {
    if (t.createdAt < since) continue;
    if (t.saleType !== "FIXED") continue;
    if (t.sellerId !== botId) continue;
    sellNet += t.netGold;
    sellQty += t.quantity;
    sellCount += 1;
  }
  return { sellNet, sellQty, sellCount };
}

function buildSignals(input: {
  goldAvailable: number;
  seedWalletGold: number;
  budgetRow: { dayKey: string; remainingBuyBudget: number } | null;
  kstToday: string;
  dailyBuyBudgetGold: number;
  tradableInvQty: number;
  activeListings: number;
  w1h: ReturnType<typeof fixedBuyWindow> & ReturnType<typeof fixedSellWindow>;
  w24: ReturnType<typeof fixedBuyWindow> & ReturnType<typeof fixedSellWindow>;
  singleBotShare24h: number | null;
}): BotAdminSignal[] {
  const signals: BotAdminSignal[] = [];

  if (!input.budgetRow) {
    signals.push({
      level: "bad",
      code: "NO_BUDGET_ROW",
      title: "예산 레코드 없음",
      detail: "시드를 다시 돌리거나 DB를 점검해.",
    });
    return signals;
  }

  if (input.budgetRow.dayKey !== input.kstToday) {
    signals.push({
      level: "info",
      code: "BUDGET_DAY_STALE",
      title: "예산 일자가 오늘(KST)과 다름",
      detail: `DB dayKey=${input.budgetRow.dayKey}, 오늘=${input.kstToday}. 봇 틱이 돌면 동기화돼.`,
    });
  }

  if (input.budgetRow.remainingBuyBudget === 0 && input.budgetRow.dayKey === input.kstToday) {
    signals.push({
      level: "info",
      code: "BUDGET_DEPLETED",
      title: "오늘 매수 예산 소진(5000)",
      detail: "정상일 수 있어. 내일 KST 자정 이후로 리셋되거나, 틱에서 일자 전환 시 갱신돼.",
    });
  }

  if (input.goldAvailable > input.seedWalletGold * TH.walletWarnVsSeed) {
    signals.push({
      level: "warn",
      code: "WALLET_HIGH",
      title: "지갑 골드가 시드 대비 큼",
      detail: `현재 ${input.goldAvailable.toLocaleString()}G (시드 ${input.seedWalletGold.toLocaleString()}G의 ${TH.walletWarnVsSeed}배 초과)`,
    });
  }

  const pnl24 = input.w24.sellNet - input.w24.buyGross;
  if (pnl24 > TH.pnlWarnGold24h) {
    signals.push({
      level: "warn",
      code: "PNL_HIGH_24H",
      title: "24h 추정 순익이 큼(고정가)",
      detail: `매도 순입금 ${input.w24.sellNet} − 매수 총액 ${input.w24.buyGross} ≈ ${pnl24}G`,
    });
  }
  if (pnl24 < -TH.pnlWarnGold24h) {
    signals.push({
      level: "warn",
      code: "PNL_LOW_24H",
      title: "24h 추정 순손실이 큼(고정가)",
      detail: `매도 순입금 ${input.w24.sellNet} − 매수 총액 ${input.w24.buyGross} ≈ ${pnl24}G`,
    });
  }

  if (input.w1h.buyGross > TH.heavyBuyGross1h || input.w1h.buyCount > TH.heavyBuyCount1h) {
    signals.push({
      level: "warn",
      code: "HEAVY_BUY_1H",
      title: "최근 1시간 매수가 과도함",
      detail: `고정가 매수 ${input.w1h.buyCount}건, 총액 ${input.w1h.buyGross}G`,
    });
  }

  if (input.activeListings > TH.listingFlood) {
    signals.push({
      level: "warn",
      code: "LISTING_FLOOD",
      title: "활성 매물 수가 많음",
      detail: `ACTIVE ${input.activeListings}건(임계 ${TH.listingFlood})`,
    });
  }

  if (
    input.tradableInvQty >= TH.minTradableQtyForSellStall &&
    input.activeListings === 0 &&
    input.w24.sellCount === 0
  ) {
    signals.push({
      level: "warn",
      code: "SELL_STALLED",
      title: "팔 수 있는 재고가 있는데 매물/매도가 없음",
      detail: "시세(최근 거래)가 없어 판매를 건너뛰는지, 틱이 안 돌아가는지 확인해.",
    });
  }

  if (input.singleBotShare24h != null && input.singleBotShare24h >= TH.singleBotMarketShareWarn) {
    signals.push({
      level: "warn",
      code: "MARKET_SHARE_HIGH",
      title: "고정가 매수 시장에서 비중이 큼",
      detail: `이 봇의 24h 매수액이 전체 고정가 매수액의 약 ${Math.round(input.singleBotShare24h * 100)}%`,
    });
  }

  return signals;
}

export async function getBotAdminDashboard() {
  const rules = GAME_RULES.bots;
  const kstToday = kstDayKey();
  const configured = getConfiguredBotCount();
  const dbBots = await findBotUsersOrdered(prisma);
  const maxIdxFromDb = dbBots.reduce((m, u) => Math.max(m, parseBotUsernameIndex(u.username) ?? 0), 0);
  const slotCount = Math.max(configured, maxIdxFromDb);
  const botNames = botUsernamesForCount(slotCount);
  const userByName = new Map(dbBots.map((u) => [u.username, u]));
  const missingUsernames = botNames.filter((n) => !userByName.has(n));
  const botIds = dbBots.map((u) => u.id);
  const botIdSet = new Set(botIds);

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since1h = new Date(Date.now() - 60 * 60 * 1000);

  const [wallets, budgets, stacks, listings, txs24, txsRecent] = await Promise.all([
    botIds.length ? prisma.wallet.findMany({ where: { userId: { in: botIds } } }) : [],
    botIds.length ? prisma.botBudget.findMany({ where: { userId: { in: botIds } } }) : [],
    botIds.length
      ? prisma.inventoryStack.findMany({
          where: { userId: { in: botIds }, quantity: { gt: 0 } },
          include: { item: true },
        })
      : [],
    botIds.length
      ? prisma.listing.findMany({
          where: { sellerId: { in: botIds }, status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
    prisma.transaction.findMany({
      where: { createdAt: { gte: since24 }, saleType: "FIXED" },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        itemId: true,
        quantity: true,
        saleType: true,
        grossGold: true,
        netGold: true,
        createdAt: true,
      },
    }),
    botIds.length
      ? prisma.transaction.findMany({
          where: {
            OR: [{ buyerId: { in: botIds } }, { sellerId: { in: botIds } }],
          },
          orderBy: { createdAt: "desc" },
          take: 160,
          select: {
            id: true,
            buyerId: true,
            sellerId: true,
            itemId: true,
            quantity: true,
            saleType: true,
            grossGold: true,
            netGold: true,
            createdAt: true,
          },
        })
      : [],
  ]);

  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));
  const budgetByUser = new Map(budgets.map((b) => [b.userId, b]));

  const stacksByUser = new Map<string, typeof stacks>();
  for (const s of stacks) {
    const arr = stacksByUser.get(s.userId) ?? [];
    arr.push(s);
    stacksByUser.set(s.userId, arr);
  }

  const listingsByUser = new Map<string, typeof listings>();
  for (const l of listings) {
    const arr = listingsByUser.get(l.sellerId) ?? [];
    arr.push(l);
    listingsByUser.set(l.sellerId, arr);
  }

  const txs24Rows = txs24 as unknown as TxRow[];
  let totalFixedBuyGross24 = 0;
  const botBuyGross24ById = new Map<string, number>();
  for (const t of txs24Rows) {
    totalFixedBuyGross24 += t.grossGold;
    if (botIdSet.has(t.buyerId)) {
      botBuyGross24ById.set(t.buyerId, (botBuyGross24ById.get(t.buyerId) ?? 0) + t.grossGold);
    }
  }

  const botFixedBuyGross24 = Array.from(botBuyGross24ById.values()).reduce((a, b) => a + b, 0);
  const botShareOfFixedBuyGross24h =
    totalFixedBuyGross24 > 0 ? botFixedBuyGross24 / totalFixedBuyGross24 : null;

  const activeFixedMarket = await prisma.listing.findMany({
    where: { status: "ACTIVE", saleType: "FIXED" },
    select: { quantity: true, sellerId: true },
  });
  const activeFixedListings = activeFixedMarket.length;
  const activeFixedQty = activeFixedMarket.reduce((a, l) => a + l.quantity, 0);
  const botEscrowQty = activeFixedMarket.filter((l) => botIdSet.has(l.sellerId)).reduce((a, l) => a + l.quantity, 0);
  const botShareOfFixedQty = activeFixedQty > 0 ? botEscrowQty / activeFixedQty : null;

  const txsRecentRows = txsRecent as unknown as TxRow[];

  const bots = botNames.map((username) => {
    const u = userByName.get(username);
    if (!u) {
      return {
        username,
        missing: true as const,
        signals: [
          {
            level: "bad" as const,
            code: "USER_MISSING",
            title: "DB에 유저가 없음",
            detail: "`POST /api/dev/seed` 또는 관리자 `POST /api/admin/bots/ensure` 로 봇을 생성해.",
          },
        ],
      };
    }

    const w = walletByUser.get(u.id);
    const bb = budgetByUser.get(u.id) ?? null;
    const inv = stacksByUser.get(u.id) ?? [];
    const lst = listingsByUser.get(u.id) ?? [];

    const tradableQty = inv.filter((s) => s.item.tradable).reduce((a, s) => a + s.quantity, 0);

    const w1hBuy = fixedBuyWindow(txs24Rows, u.id, since1h);
    const w1hSell = fixedSellWindow(txs24Rows, u.id, since1h);
    const w24Buy = fixedBuyWindow(txs24Rows, u.id, since24);
    const w24Sell = fixedSellWindow(txs24Rows, u.id, since24);

    const myBuy24 = w24Buy.buyGross;
    const singleBotShare24h = totalFixedBuyGross24 > 0 ? myBuy24 / totalFixedBuyGross24 : null;

    const signals = buildSignals({
      goldAvailable: w?.goldAvailable ?? 0,
      seedWalletGold: rules.seedWalletGold,
      budgetRow: bb,
      kstToday,
      dailyBuyBudgetGold: rules.dailyBuyBudgetGold,
      tradableInvQty: tradableQty,
      activeListings: lst.length,
      w1h: { ...w1hBuy, ...w1hSell },
      w24: { ...w24Buy, ...w24Sell },
      singleBotShare24h,
    });

    const recentTrades = txsRecentRows
      .filter((t) => t.buyerId === u.id || t.sellerId === u.id)
      .slice(0, 10)
      .map((t) => {
        const side: "buy" | "sell" = t.buyerId === u.id ? "buy" : "sell";
        const gold = side === "buy" ? t.grossGold : t.netGold;
        return {
          at: t.createdAt.toISOString(),
          side,
          saleType: t.saleType,
          itemId: t.itemId,
          qty: t.quantity,
          gold,
        };
      });

    const budgetUsedToday =
      bb && bb.dayKey === kstToday ? Math.max(0, rules.dailyBuyBudgetGold - bb.remainingBuyBudget) : null;

    return {
      missing: false as const,
      id: u.id,
      username: u.username,
      wallet: { goldAvailable: w?.goldAvailable ?? 0, goldLocked: w?.goldLocked ?? 0 },
      budget: bb
        ? {
            dayKey: bb.dayKey,
            remainingBuyBudget: bb.remainingBuyBudget,
            dailyBuyBudgetGold: rules.dailyBuyBudgetGold,
            budgetUsedToday,
            alignedWithKstToday: bb.dayKey === kstToday,
          }
        : null,
      inventory: {
        tradableQty,
        stacks: inv.map((s) => ({
          itemId: s.itemId,
          name: s.item.name,
          quantity: s.quantity,
          tradable: s.item.tradable,
        })),
      },
      listings: {
        activeCount: lst.length,
        activeQty: lst.reduce((a, l) => a + l.quantity, 0),
        samples: lst.slice(0, 6).map((l) => ({
          id: l.id,
          itemId: l.itemId,
          qty: l.quantity,
          unit: l.fixedPricePerUnit,
        })),
      },
      activity: {
        last1h: {
          ...w1hBuy,
          ...w1hSell,
          pnlApprox: w1hSell.sellNet - w1hBuy.buyGross,
        },
        last24h: {
          ...w24Buy,
          ...w24Sell,
          pnlApprox: w24Sell.sellNet - w24Buy.buyGross,
        },
      },
      recentTrades,
      signals,
    };
  });

  const globalSignals: BotAdminSignal[] = [];
  if (missingUsernames.length > 0) {
    globalSignals.push({
      level: "bad",
      code: "MISSING_BOTS",
      title: "설정된 봇 유저가 DB에 부족함",
      detail: missingUsernames.join(", "),
    });
  }
  if (maxIdxFromDb > configured) {
    globalSignals.push({
      level: "info",
      code: "MORE_BOTS_THAN_ENV",
      title: "DB 봇 수가 BOT_COUNT(또는 기본값)보다 많음",
      detail: `BOT_COUNT=${configured}, DB 최대 번호=${maxIdxFromDb}. 틱은 DB에 있는 봇 전원을 돌려.`,
    });
  }
  if (botShareOfFixedBuyGross24h != null && botShareOfFixedBuyGross24h >= TH.allBotsMarketShareWarn) {
    globalSignals.push({
      level: "warn",
      code: "ALL_BOTS_DOMINATE_BUYS",
      title: "고정가 매수의 대부분이 봇임(24h)",
      detail: `봇 매수액 비중 약 ${Math.round(botShareOfFixedBuyGross24h * 100)}%`,
    });
  }
  if (botShareOfFixedQty != null && botShareOfFixedQty >= 0.55) {
    globalSignals.push({
      level: "info",
      code: "BOT_ESCROW_WEIGHT",
      title: "고정가 매물 수량 중 봇이 올린 비중이 큼",
      detail: `봇 위탁 수량 비중 약 ${Math.round(botShareOfFixedQty * 100)}%`,
    });
  }

  return {
    ok: true as const,
    generatedAt: new Date().toISOString(),
    kstDayKey: kstToday,
    rules: {
      count: rules.count,
      configuredBotCount: configured,
      dbBotUsers: dbBots.length,
      usernameSlots: slotCount,
      usernamePrefix: rules.usernamePrefix,
      dailyBuyBudgetGold: rules.dailyBuyBudgetGold,
      seedWalletGold: rules.seedWalletGold,
      seedItems: rules.seedStacks.map((s) => s.itemId),
      buyProbability: rules.buyProbability,
      priceBand: rules.priceBand,
    },
    thresholds: TH,
    missingUsernames,
    market: {
      activeFixedListings,
      activeFixedQty,
      botEscrowQtyOnFixed: botEscrowQty,
      fixedBuyGrossGold24h: totalFixedBuyGross24,
      botFixedBuyGrossGold24h: botFixedBuyGross24,
      botShareOfFixedBuyGross24h,
      botShareOfActiveFixedQty: botShareOfFixedQty,
    },
    globalSignals,
    bots,
  };
}
