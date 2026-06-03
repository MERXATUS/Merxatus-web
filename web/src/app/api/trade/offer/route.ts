import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { updateTradeOffer } from "@/server/trade";

export const runtime = "nodejs";

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STACK"), itemId: z.string().min(1), quantity: z.number().int().positive() }),
  z.object({ kind: z.literal("WEAPON_INSTANCE"), weaponInstanceId: z.string().min(1) }),
  z.object({ kind: z.literal("ARMOR_INSTANCE"), armorInstanceId: z.string().min(1) }),
]);

const BodySchema = z.object({
  tradeId: z.string().min(1),
  offeredGold: z.number().int().min(0),
  items: z.array(ItemSchema).max(40),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const r = await updateTradeOffer({
      userId: auth.userId,
      tradeId: parsed.data.tradeId,
      offeredGold: parsed.data.offeredGold,
      items: parsed.data.items,
    });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const status =
      msg === "TRADE_NOT_FOUND"
        ? 404
        : msg === "FORBIDDEN"
          ? 403
          : ["TRADE_NOT_EDITABLE", "TRADE_LOCKED", "TRADE_EXPIRED"].includes(msg)
            ? 400
            : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}

