import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const QuerySchema = z.object({
  // Default window: 14 days
  days: z.coerce.number().int().min(1).max(90).optional(),
});

function dayKey(d: Date) {
  // Local calendar day key YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, null);
  if (!auth.ok)
    return Response.json(
      { ok: false, error: auth.error },
      { status: 401 },
    );
  const userId = auth.userId;

  const days = parsed.data.days ?? 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const txs = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: since },
      OR: [{ buyerId: userId }, { sellerId: userId }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      buyerId: true,
      sellerId: true,
      grossGold: true,
      netGold: true,
    },
  });

  // ??? ??????: ?? = -gross, ?? = +net
  const byDay = new Map<string, number>();
  for (const t of txs) {
    const k = dayKey(t.createdAt);
    const delta = t.buyerId === userId ? -t.grossGold : t.sellerId === userId ? t.netGold : 0;
    byDay.set(k, (byDay.get(k) ?? 0) + delta);
  }

  const keys = Array.from(byDay.keys()).sort();
  let cum = 0;
  const points = keys.map((k) => {
    const delta = byDay.get(k) ?? 0;
    cum += delta;
    return { day: k, delta, cumulative: cum };
  });

  const total = points.length ? points[points.length - 1]!.cumulative : 0;

  return Response.json({
    ok: true,
    days,
    since: since.toISOString(),
    points,
    summary: {
      txs: txs.length,
      totalPnl: total,
      avgDaily: points.length ? total / points.length : 0,
    },
  });
}

