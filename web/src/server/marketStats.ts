import { prisma } from "@/server/db";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";

/** 최근 거래들의 단가 평균(거래가 없으면 null). `/api/market/stats`와 동일한 정의. */
export async function avgUnitPriceFromRecentTrades(itemId: string, take: number) {
  const txs = await prisma.transaction.findMany({
    where: { itemId },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

  if (txs.length === 0) return null;

  let sum = 0;
  for (const t of txs) {
    const qty = t.quantity || 1;
    sum += t.grossGold / qty;
  }

  return sum / txs.length;
}

/** 최근 거래 평균이 없을 때, 현재 활성 고정가 매물 단가의 중앙값을 폴백으로 사용 */
export async function medianUnitPriceFromActiveFixedListings(itemId: string, take: number) {
  const listings = await prisma.listing.findMany({
    where: { status: "ACTIVE", saleType: "FIXED", itemId },
    orderBy: [{ createdAt: "desc" }],
    take,
    select: { fixedPricePerUnit: true, fixedPriceTotal: true, quantity: true },
  });

  const prices = listings
    .map((l) => {
      if (l.fixedPricePerUnit != null && l.fixedPricePerUnit > 0) return l.fixedPricePerUnit;
      if (l.fixedPriceTotal != null && l.fixedPriceTotal > 0 && l.quantity > 0) return l.fixedPriceTotal / l.quantity;
      return 0;
    })
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 1 ? prices[mid]! : (prices[mid - 1]! + prices[mid]!) / 2;
}

/** 봇/간이 UI용 기준 단가: 거래 평균 → 활성 매물 중앙값 */
export async function referenceUnitPrice(itemId: string, input: { tradeTake: number; listingTake: number }) {
  const avg = await avgUnitPriceFromRecentTrades(itemId, input.tradeTake);
  if (avg != null) return { ref: avg, source: "TRADES_AVG" as const };
  const med = await medianUnitPriceFromActiveFixedListings(itemId, input.listingTake);
  if (med != null) return { ref: med, source: "ACTIVE_LISTINGS_MEDIAN" as const };
  return { ref: referenceGoldPerUnit(itemId), source: "REFERENCE_GOLD" as const };
}
