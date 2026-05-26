import { prisma } from "@/server/db";
import { loadMerxatusRoyalPriceRows } from "@/server/merxatusRoyalCsv";
import { upsertRoyalPricesFromMerxatusRows } from "@/server/applyMerxatusRoyalPrices";
import { guardDevApi } from "@/server/devApiGuard";

export const runtime = "nodejs";

/** 개발용: `Merxatus-Price.csv`(또는 내장 기본값)만 DB `RoyalPrice`에 다시 반영 */
export async function POST() {
  const blocked = guardDevApi();
  if (blocked) return blocked;
  try {
    const rows = await loadMerxatusRoyalPriceRows();
    const applied = await upsertRoyalPricesFromMerxatusRows(prisma, rows);
    return Response.json({
      ok: true as const,
      applied,
      itemIds: rows.map((r) => r.itemId),
      prices: rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/dev/merxatus-royal-sync]", e);
    return Response.json({ ok: false as const, error: message }, { status: 500 });
  }
}
