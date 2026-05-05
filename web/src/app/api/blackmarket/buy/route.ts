import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { blackMarketBuy } from "@/server/blackMarket";

export const runtime = "nodejs";

const BodySchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(1_000).default(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const out = await blackMarketBuy({
    userId: auth.userId,
    itemId: parsed.data.itemId,
    quantity: parsed.data.quantity,
  });
  if (!out.ok) return Response.json(out, { status: out.error === "USER_NOT_FOUND" ? 404 : 400 });
  return Response.json(out);
}

