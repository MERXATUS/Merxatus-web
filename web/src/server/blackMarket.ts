import { prisma } from "@/server/db";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { GAME_RULES } from "@/server/gameRules";

export type BlackMarketEventView = {
  id: string;
  kind: "BOOM" | "CRASH";
  category: string | null;
  itemId: string | null;
  multiplier: number;
  startsAt: Date;
  endsAt: Date;
};

function isMaterial(item: { category: string; tradable: boolean }) {
  return item.tradable && item.category === "재료";
}

function infamyDeltaForTrade(grossGold: number) {
  // 500G당 1 악명(최소 1)
  return Math.max(1, Math.floor(Math.max(0, grossGold) / 500));
}

export function maxTradableGradeByInfamy(infamyPoints: number) {
  // 이벤트 기반 암시장이라도 해금은 단순 임계치로
  if (infamyPoints >= 200_000) return 5; // 전설
  if (infamyPoints >= 60_000) return 4; // 영웅
  if (infamyPoints >= 20_000) return 3; // 유니크
  return 2; // 레어
}

export async function activeBlackMarketEvent(now = new Date()): Promise<BlackMarketEventView | null> {
  const row = await prisma.blackMarketEvent.findFirst({
    where: { startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }],
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    category: row.category ?? null,
    itemId: row.itemId ?? null,
    multiplier: row.multiplier,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

export async function blackMarketPriceForItem(input: {
  itemId: string;
  basePricePerUnit: number;
  now?: Date;
}): Promise<{ pricePerUnit: number; eventId: string | null }> {
  const now = input.now ?? new Date();
  const [p, ev] = await Promise.all([
    prisma.blackMarketPrice.findUnique({ where: { itemId: input.itemId }, select: { multiplier: true } }),
    activeBlackMarketEvent(now),
  ]);
  const baseMult = typeof p?.multiplier === "number" && Number.isFinite(p.multiplier) ? p.multiplier : 1;
  const eventMult =
    ev && (ev.itemId === input.itemId || (ev.itemId == null && (ev.category == null || ev.category === "재료")))
      ? ev.multiplier
      : 1;
  const mult = Math.max(0.05, Math.min(10, baseMult * eventMult));
  const pricePerUnit = Math.max(1, Math.floor(input.basePricePerUnit * mult));
  return { pricePerUnit, eventId: ev ? ev.id : null };
}

export async function listBlackMarketState(userId: string) {
  const [user, ev] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { infamyPoints: true, honorPoints: true } }),
    activeBlackMarketEvent(),
  ]);
  const u0 = user;
  if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
  const honor = Math.max(0, Math.floor(u0.honorPoints ?? 0));
  const locked = honor >= GAME_RULES.reputation.honorBlocksBlackMarketAt;
  const maxGrade = maxTradableGradeByInfamy(u0.infamyPoints ?? 0);
  return {
    ok: true as const,
    infamyPoints: u0.infamyPoints ?? 0,
    honorPoints: honor,
    locked,
    lockedReason: locked ? "HONOR_TOO_HIGH_FOR_BLACKMARKET" : null,
    maxGrade,
    event: ev,
  };
}

export async function listBlackMarketPrices(userId: string) {
  const state = await listBlackMarketState(userId);
  if (!state.ok) return state;
  const maxGrade = state.maxGrade;
  const [items, wallet] = await Promise.all([
    prisma.item.findMany({
      where: { tradable: true, category: "재료", grade: { lte: maxGrade } },
      orderBy: [{ grade: "asc" }, { id: "asc" }],
      take: 200,
    }),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);
  const now = new Date();
  const ev = state.event;
  const stacks =
    items.length > 0
      ? await prisma.inventoryStack.findMany({
          where: { userId, itemId: { in: items.map((i) => i.id) } },
          select: { itemId: true, quantity: true },
        })
      : [];
  const qtyByItemId = new Map(stacks.map((s) => [s.itemId, s.quantity]));
  const out = await Promise.all(
    items.map(async (it) => {
      const base = referenceGoldPerUnit(it.id);
      const p = await blackMarketPriceForItem({ itemId: it.id, basePricePerUnit: base, now });
      const evApplied =
        ev && (ev.itemId === it.id || (ev.itemId == null && (ev.category == null || ev.category === it.category)));
      return {
        itemId: it.id,
        name: it.name,
        category: it.category,
        grade: it.grade,
        pricePerUnit: p.pricePerUnit,
        eventId: p.eventId,
        eventApplied: !!evApplied,
        ownedQty: qtyByItemId.get(it.id) ?? 0,
      };
    }),
  );
  return { ...state, goldAvailable: wallet?.goldAvailable ?? 0, items: out };
}

export async function blackMarketBuy(input: { userId: string; itemId: string; quantity: number }) {
  const qty = Math.max(1, Math.floor(input.quantity));
  return prisma.$transaction(async (tx) => {
    const [user, wallet, item] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId }, select: { infamyPoints: true, honorPoints: true } }),
      tx.wallet.findUnique({ where: { userId: input.userId } }),
      tx.item.findUnique({ where: { id: input.itemId } }),
    ]);
    const u0 = user;
    if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
    const honor = Math.max(0, Math.floor(u0.honorPoints ?? 0));
    if (honor >= GAME_RULES.reputation.honorBlocksBlackMarketAt) {
      return { ok: false as const, error: "HONOR_TOO_HIGH_FOR_BLACKMARKET" as const };
    }
    if (!wallet) return { ok: false as const, error: "WALLET_NOT_FOUND" as const };
    if (!item) return { ok: false as const, error: "ITEM_NOT_FOUND" as const };
    if (!isMaterial(item)) return { ok: false as const, error: "ITEM_NOT_ALLOWED" as const };

    const maxGrade = maxTradableGradeByInfamy(u0.infamyPoints ?? 0);
    if ((item.grade ?? 1) > maxGrade) return { ok: false as const, error: "INFAMY_TOO_LOW" as const };

    const base = referenceGoldPerUnit(input.itemId);
    const { pricePerUnit, eventId } = await blackMarketPriceForItem({ itemId: input.itemId, basePricePerUnit: base });
    const grossGold = Math.max(0, pricePerUnit * qty);
    if (wallet.goldAvailable < grossGold) return { ok: false as const, error: "INSUFFICIENT_GOLD" as const };

    await tx.wallet.update({ where: { userId: input.userId }, data: { goldAvailable: { decrement: grossGold } } });
    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId: input.userId, itemId: input.itemId } },
      create: { userId: input.userId, itemId: input.itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });

    const infamyDelta = infamyDeltaForTrade(grossGold);
    await tx.user.update({ where: { id: input.userId }, data: { infamyPoints: { increment: infamyDelta } } });
    await tx.blackMarketTradeLog.create({
      data: {
        userId: input.userId,
        itemId: input.itemId,
        side: "BUY",
        quantity: qty,
        goldDelta: -grossGold,
        infamyDelta,
        eventId,
      },
    });

    return { ok: true as const, quantity: qty, goldPaid: grossGold, pricePerUnit, infamyDelta, eventId };
  });
}

export async function blackMarketSell(input: { userId: string; itemId: string; quantity: number }) {
  const qty = Math.max(1, Math.floor(input.quantity));
  return prisma.$transaction(async (tx) => {
    const [user, wallet, item, stack] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId }, select: { infamyPoints: true, honorPoints: true } }),
      tx.wallet.findUnique({ where: { userId: input.userId } }),
      tx.item.findUnique({ where: { id: input.itemId } }),
      tx.inventoryStack.findUnique({ where: { userId_itemId: { userId: input.userId, itemId: input.itemId } } }),
    ]);
    const u0 = user;
    if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
    const honor = Math.max(0, Math.floor(u0.honorPoints ?? 0));
    if (honor >= GAME_RULES.reputation.honorBlocksBlackMarketAt) {
      return { ok: false as const, error: "HONOR_TOO_HIGH_FOR_BLACKMARKET" as const };
    }
    if (!wallet) return { ok: false as const, error: "WALLET_NOT_FOUND" as const };
    if (!item) return { ok: false as const, error: "ITEM_NOT_FOUND" as const };
    if (!isMaterial(item)) return { ok: false as const, error: "ITEM_NOT_ALLOWED" as const };
    if (!stack || stack.quantity < qty) return { ok: false as const, error: "INSUFFICIENT_ITEMS" as const };

    const maxGrade = maxTradableGradeByInfamy(u0.infamyPoints ?? 0);
    if ((item.grade ?? 1) > maxGrade) return { ok: false as const, error: "INFAMY_TOO_LOW" as const };

    const base = referenceGoldPerUnit(input.itemId);
    const { pricePerUnit, eventId } = await blackMarketPriceForItem({ itemId: input.itemId, basePricePerUnit: base });
    const grossGold = Math.max(0, pricePerUnit * qty);

    await tx.inventoryStack.update({
      where: { userId_itemId: { userId: input.userId, itemId: input.itemId } },
      data: { quantity: { decrement: qty } },
    });
    await tx.wallet.update({ where: { userId: input.userId }, data: { goldAvailable: { increment: grossGold } } });

    const infamyDelta = infamyDeltaForTrade(grossGold);
    await tx.user.update({ where: { id: input.userId }, data: { infamyPoints: { increment: infamyDelta } } });
    await tx.blackMarketTradeLog.create({
      data: {
        userId: input.userId,
        itemId: input.itemId,
        side: "SELL",
        quantity: qty,
        goldDelta: grossGold,
        infamyDelta,
        eventId,
      },
    });

    return { ok: true as const, quantity: qty, goldReceived: grossGold, pricePerUnit, infamyDelta, eventId };
  });
}

