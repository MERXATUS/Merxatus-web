import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { createTradeSession } from "@/server/trade";

export const runtime = "nodejs";

const BodySchema = z.object({
  counterpartyUsername: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const r = await createTradeSession({ userId: auth.userId, counterpartyUsername: parsed.data.counterpartyUsername });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const status = msg === "TRADE_USER_NOT_FOUND" || msg === "TRADE_CANNOT_SELF" ? 400 : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}

