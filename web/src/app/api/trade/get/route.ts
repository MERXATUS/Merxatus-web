import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { getTradeSessionForUser } from "@/server/trade";

export const runtime = "nodejs";

const QuerySchema = z.object({
  tradeId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    tradeId: url.searchParams.get("tradeId") ?? "",
    userId: url.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const r = await getTradeSessionForUser({ userId: auth.userId, tradeId: parsed.data.tradeId });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const status = msg === "TRADE_NOT_FOUND" ? 404 : msg === "FORBIDDEN" ? 403 : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}

