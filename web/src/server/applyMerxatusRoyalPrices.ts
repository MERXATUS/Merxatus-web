import type { PrismaClient } from "@prisma/client";
import { loadMerxatusRoyalPriceRows, type MerxatusRoyalRow } from "@/server/merxatusRoyalCsv";

type DbLike = Pick<PrismaClient, "royalPrice">;

export async function upsertRoyalPricesFromMerxatusRows(db: DbLike, rows: MerxatusRoyalRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    await db.royalPrice.upsert({
      where: { itemId: r.itemId },
      create: {
        itemId: r.itemId,
        buyPricePerUnit: r.buyPricePerUnit,
        sellPricePerUnit: r.sellPricePerUnit,
        enabled: true,
      },
      update: {
        buyPricePerUnit: r.buyPricePerUnit,
        sellPricePerUnit: r.sellPricePerUnit,
        enabled: true,
      },
    });
    n++;
  }
  return n;
}

/** `Merxatus-Price.csv`가 있으면 황실 가격을 덮어쓴다. 적용한 행 수를 반환한다. */
export async function applyMerxatusRoyalPricesIfConfigured(db: DbLike): Promise<{ applied: number; skipped: boolean }> {
  const rows = await loadMerxatusRoyalPriceRows();
  if (rows.length === 0) return { applied: 0, skipped: true };
  const applied = await upsertRoyalPricesFromMerxatusRows(db, rows);
  return { applied, skipped: false };
}
