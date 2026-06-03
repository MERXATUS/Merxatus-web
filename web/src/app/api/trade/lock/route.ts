import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { lockTradeSide } from "@/server/trade";

export const runtime = "nodejs";

const BodySchema = z.object({
  tradeId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const r = await lockTradeSide({ userId: auth.userId, tradeId: parsed.data.tradeId });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const status =
      msg === "TRADE_NOT_FOUND"
        ? 404
        : msg === "FORBIDDEN"
          ? 403
          : ["TRADE_EXPIRED", "INSUFFICIENT_GOLD", "INSUFFICIENT_ITEM", "WEAPON_NOT_OWNED", "ARMOR_INSTANCE_NOT_AVAILABLE"].includes(msg)
            ? 400
            : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}

