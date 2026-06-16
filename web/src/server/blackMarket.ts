import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { takeAvailableFromStack } from "@/server/inventoryStackOps";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { GAME_RULES } from "@/server/gameRules";
import { itemIconFieldsForItemId } from "@/server/itemCatalog";

export type BlackMarketEventView = {
  id: string;
  kind: "BOOM" | "CRASH";
  category: string | null;
  itemId: string | null;
  multiplier: number;
  startsAt: Date;
  endsAt: Date;
};

/** 암시장 시계열 변동(UTC): 5분 슬롯, 매 정각 이후 첫 5분은 황실 연동 기준으로 초기화(배수 1) */
export const BLACK_MARKET_FIVE_MIN_MS = 5 * 60 * 1000;
export const BLACK_MARKET_HOUR_MS = 60 * 60 * 1000;

function isMaterial(item: { category: string; tradable: boolean }) {
  return item.tradable && item.category === "재료";
}

function infamyDeltaForTrade(grossGold: number) {
  return Math.max(1, Math.floor(Math.max(0, grossGold) / 500));
}

export function maxTradableGradeByInfamy(infamyPoints: number) {
  if (infamyPoints >= 200_000) return 5;
  if (infamyPoints >= 60_000) return 4;
  if (infamyPoints >= 20_000) return 3;
  return 2;
}

type BlackMarketEventRow = {
  id: string;
  kind: "BOOM" | "CRASH";
  category: string | null;
  itemId: string | null;
  multiplier: number;
  startsAt: Date;
  endsAt: Date;
};

function toEventView(row: BlackMarketEventRow): BlackMarketEventView {
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

async function activeBlackMarketEventCore(
  db: Pick<PrismaClient, "blackMarketEvent">,
  now: Date,
): Promise<BlackMarketEventView | null> {
  const row = await db.blackMarketEvent.findFirst({
    where: { startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "desc" }],
  });
  if (!row) return null;
  return toEventView(row);
}

export async function activeBlackMarketEvent(now = new Date()): Promise<BlackMarketEventView | null> {
  return activeBlackMarketEventCore(prisma, now);
}

export function djb2Hash32(str: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/** UTC 기준 `tMs`가 속한 해의 인덱스(정수 시간 블록). */
export function utcHourBlockIndex(tMs: number): number {
  if (!Number.isFinite(tMs)) return 0;
  return Math.floor(tMs / BLACK_MARKET_HOUR_MS);
}

/** UTC 기준 매 정각으로 0..11 (12개) 5분 슬롯 */
export function utcSlotIndexWithinHour(tMs: number): number {
  if (!Number.isFinite(tMs)) return 0;
  const msInHour = ((tMs % BLACK_MARKET_HOUR_MS) + BLACK_MARKET_HOUR_MS) % BLACK_MARKET_HOUR_MS;
  return Math.min(11, Math.floor(msInHour / BLACK_MARKET_FIVE_MIN_MS));
}

/** UTC 기준 `tMs`가 속한 5분 슬롯의 시작 시각(ms) */
export function utcSlotStartMs(tMs: number): number {
  if (!Number.isFinite(tMs)) return 0;
  const hourStart = Math.floor(tMs / BLACK_MARKET_HOUR_MS) * BLACK_MARKET_HOUR_MS;
  const slot = utcSlotIndexWithinHour(tMs);
  return hourStart + slot * BLACK_MARKET_FIVE_MIN_MS;
}

/** 직전 5분 슬롯 시작 시각(ms) — slot 0이면 이전 시간 11번 슬롯 */
export function utcPreviousSlotStartMs(tMs: number): number {
  if (!Number.isFinite(tMs)) return 0;
  const slotStart = utcSlotStartMs(tMs);
  if (utcSlotIndexWithinHour(tMs) <= 0) {
    return slotStart - BLACK_MARKET_HOUR_MS + 11 * BLACK_MARKET_FIVE_MIN_MS;
  }
  return slotStart - BLACK_MARKET_FIVE_MIN_MS;
}

/**
 * 황실 기준가에 곱해지는 시간 배수.
 * - 매 시간 0번째 5분 구간: 1.0 (초기화)
 * - 나머지 구간: 아이템·시간대에 따라 [0.9, 1.1] 결정론적 변동
 */
export function blackMarketTimeMultiplier(itemId: string, tMs: number): number {
  const slot = utcSlotIndexWithinHour(tMs);
  if (slot <= 0) return 1;
  const hour = utcHourBlockIndex(tMs);
  const r = djb2Hash32(`${itemId}|${hour}|${slot}`) % 10_001;
  return 0.9 + (r / 10_000) * 0.2;
}

export function eventMultiplierForItem(
  ev: BlackMarketEventView | null,
  itemId: string,
  itemCategory: string,
): number {
  if (!ev) return 1;
  if (ev.itemId === itemId) return ev.multiplier;
  if (ev.itemId == null && (ev.category == null || ev.category === itemCategory)) return ev.multiplier;
  return 1;
}

async function resolveBlackMarketBaseGoldPerUnit(
  db: Pick<PrismaClient, "royalPrice">,
  itemId: string,
): Promise<number> {
  const rp = await db.royalPrice.findUnique({
    where: { itemId },
    include: { item: { select: { tradable: true, category: true } } },
  });
  if (rp?.enabled && rp.item?.tradable && rp.item.category === "재료") {
    return Math.max(1, Math.floor((Number(rp.buyPricePerUnit) + Number(rp.sellPricePerUnit)) / 2));
  }
  return Math.max(1, Math.floor(referenceGoldPerUnit(itemId)));
}

type DbForBm = Pick<PrismaClient, "blackMarketPrice" | "royalPrice" | "blackMarketEvent">;

function clampPriceMult(m: number): number {
  return Math.max(0.05, Math.min(10, m));
}

export async function blackMarketPriceForItem(input: {
  itemId: string;
  now?: Date;
  tx?: DbForBm;
}): Promise<{ pricePerUnit: number; eventId: string | null }> {
  const db = input.tx ?? prisma;
  const now = input.now ?? new Date();
  const tMs = now.getTime();
  const [baseGold, pRow, ev] = await Promise.all([
    resolveBlackMarketBaseGoldPerUnit(db, input.itemId),
    db.blackMarketPrice.findUnique({ where: { itemId: input.itemId }, select: { multiplier: true } }),
    activeBlackMarketEventCore(db, now),
  ]);
  const dbMult = typeof pRow?.multiplier === "number" && Number.isFinite(pRow.multiplier) ? pRow.multiplier : 1;
  const timeMult = blackMarketTimeMultiplier(input.itemId, tMs);
  const itemCat = "재료";
  const evMult = eventMultiplierForItem(ev, input.itemId, itemCat);
  const mult = clampPriceMult(dbMult * timeMult * evMult);
  return { pricePerUnit: Math.max(1, Math.floor(baseGold * mult)), eventId: ev ? ev.id : null };
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

function computeStackPrice(input: {
  baseGold: number;
  dbMult: number;
  tMs: number;
  itemId: string;
  itemCategory: string;
  ev: BlackMarketEventView | null;
}) {
  const mult = computeStackMultiplier(input);
  return Math.max(1, Math.floor(input.baseGold * mult));
}

function computeStackMultiplier(input: {
  dbMult: number;
  tMs: number;
  itemId: string;
  itemCategory: string;
  ev: BlackMarketEventView | null;
}) {
  const timeMult = blackMarketTimeMultiplier(input.itemId, input.tMs);
  const evMult = eventMultiplierForItem(input.ev, input.itemId, input.itemCategory);
  return clampPriceMult(input.dbMult * timeMult * evMult);
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
  const nowMs = now.getTime();
  const prevSlotMs = utcPreviousSlotStartMs(nowMs);
  const [evNow, evPrevSlot] = await Promise.all([
    activeBlackMarketEventCore(prisma, now),
    activeBlackMarketEventCore(prisma, new Date(prevSlotMs)),
  ]);
  const ev = state.event;

  const ids = items.map((i) => i.id);
  const [royals, bmRows] = await Promise.all([
    ids.length
      ? prisma.royalPrice.findMany({
          where: { itemId: { in: ids }, enabled: true },
          include: { item: { select: { tradable: true, category: true } } },
        })
      : [],
    ids.length ? prisma.blackMarketPrice.findMany({ where: { itemId: { in: ids } } }) : [],
  ]);
  const midByItem = new Map<string, number>();
  for (const rp of royals) {
    if (!rp.item?.tradable || rp.item.category !== "재료") continue;
    midByItem.set(
      rp.itemId,
      Math.max(1, Math.floor((Number(rp.buyPricePerUnit) + Number(rp.sellPricePerUnit)) / 2)),
    );
  }
  const dbMultByItem = new Map(bmRows.map((r) => [r.itemId, r.multiplier]));

  const stacks =
    items.length > 0
      ? await prisma.inventoryStack.findMany({
          where: { userId, itemId: { in: ids } },
          select: { itemId: true, quantity: true },
        })
      : [];
  const qtyByItemId = new Map(stacks.map((s) => [s.itemId, s.quantity]));

  const out = await Promise.all(
    items.map(async (it) => {
      const baseGold = midByItem.get(it.id) ?? Math.max(1, Math.floor(referenceGoldPerUnit(it.id)));
      const dbMult = typeof dbMultByItem.get(it.id) === "number" ? (dbMultByItem.get(it.id) as number) : 1;
      const pricePerUnit = computeStackPrice({
        baseGold,
        dbMult,
        tMs: nowMs,
        itemId: it.id,
        itemCategory: it.category,
        ev: evNow,
      });
      const multNow = computeStackMultiplier({
        dbMult,
        tMs: nowMs,
        itemId: it.id,
        itemCategory: it.category,
        ev: evNow,
      });
      const multPrev = computeStackMultiplier({
        dbMult,
        tMs: prevSlotMs,
        itemId: it.id,
        itemCategory: it.category,
        ev: evPrevSlot,
      });
      let priceDeltaPct: number | null = null;
      let priceDeltaDir: "up" | "down" | "flat" = "flat";
      if (multPrev > 0) {
        const rawPct = ((multNow - multPrev) / multPrev) * 100;
        priceDeltaPct = Math.round(rawPct * 10) / 10;
        if (rawPct > 0.0001) priceDeltaDir = "up";
        else if (rawPct < -0.0001) priceDeltaDir = "down";
        else if (multNow !== multPrev) {
          priceDeltaPct = 0;
        }
      }

      const evApplied =
        ev && (ev.itemId === it.id || (ev.itemId == null && (ev.category == null || ev.category === it.category)));
      const iconFields = await itemIconFieldsForItemId(it.id);
      return {
        itemId: it.id,
        name: it.name,
        category: it.category,
        grade: it.grade,
        pricePerUnit,
        eventId: evNow ? evNow.id : null,
        eventApplied: !!evApplied,
        ownedQty: qtyByItemId.get(it.id) ?? 0,
        priceDeltaPct,
        priceDeltaDir,
        icon: iconFields.icon,
        iconSrc: iconFields.iconSrc,
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

    const { pricePerUnit, eventId } = await blackMarketPriceForItem({ itemId: input.itemId, tx });
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
    const available = stack ? stack.quantity - Math.max(0, stack.lockedQuantity) : 0;
    if (!stack || available < qty) {
      return {
        ok: false as const,
        error: (stack && stack.quantity >= qty ? "ITEM_LOCKED" : "INSUFFICIENT_ITEMS") as
          | "ITEM_LOCKED"
          | "INSUFFICIENT_ITEMS",
      };
    }

    const maxGrade = maxTradableGradeByInfamy(u0.infamyPoints ?? 0);
    if ((item.grade ?? 1) > maxGrade) return { ok: false as const, error: "INFAMY_TOO_LOW" as const };

    const { pricePerUnit, eventId } = await blackMarketPriceForItem({ itemId: input.itemId, tx });
    const grossGold = Math.max(0, pricePerUnit * qty);

    await takeAvailableFromStack(tx, input.userId, input.itemId, qty);
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
