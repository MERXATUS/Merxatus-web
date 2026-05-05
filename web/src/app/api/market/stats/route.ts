import { z } from "zod";
import { prisma } from "@/server/db";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { itemGradeLabel } from "@/server/itemGrade";

export const runtime = "nodejs";

const QuerySchema = z.object({
  itemId: z.string().min(1),
  take: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    itemId: url.searchParams.get("itemId"),
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const { itemId } = parsed.data;
  const take = parsed.data.take ?? 50;

  const txs = await prisma.transaction.findMany({
    where: {
      itemId,
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

  const trades = txs.map((t) => {
    const qty = t.quantity || 1;
    const unitPrice = t.grossGold / qty;
    return {
      transactionId: t.id,
      createdAt: t.createdAt,
      grossGold: t.grossGold,
      feeGold: t.feeGold,
      netGold: t.netGold,
      quantity: qty,
      unitPrice,
      buyerId: t.buyerId,
      sellerId: t.sellerId,
      saleType: t.saleType,
      listingId: t.listingId,
    };
  });

  const unitPrices = trades.map((t) => t.unitPrice);
  const quantities = trades.map((t) => t.quantity);

  const last = trades[0] ?? null;
  const avg =
    unitPrices.length > 0 ? unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length : null;
  const min = unitPrices.length > 0 ? Math.min(...unitPrices) : null;
  const max = unitPrices.length > 0 ? Math.max(...unitPrices) : null;
  const volume = quantities.reduce((a, b) => a + b, 0);

  const item = await prisma.item.findUnique({ where: { id: itemId } });

  return Response.json({
    ok: true,
    item: item
      ? {
          id: item.id,
          name: item.name,
          category: item.category,
          grade: item.grade,
          gradeLabel: itemGradeLabel(item.grade),
        }
      : { id: itemId, name: null, category: null, grade: null, gradeLabel: null },
    summary: {
      trades: trades.length,
      volume,
      lastUnitPrice: last ? last.unitPrice : null,
      avgUnitPrice: avg,
      minUnitPrice: min,
      maxUnitPrice: max,
      /** 거래·매물 시세가 없을 때 UI/폴백용 기준 단가(돌=10G 앵커) */
      referenceGoldPerUnit: referenceGoldPerUnit(itemId),
    },
    trades,
  });
}

