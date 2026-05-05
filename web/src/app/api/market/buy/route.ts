import { z } from "zod";
import { buyFixedListingPartial } from "@/server/market";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  listingId: z.string().min(1),
  buyerId: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.buyerId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await buyFixedListingPartial({
      listingId: parsed.data.listingId,
      buyerId: auth.userId,
      quantity: parsed.data.quantity ?? 1,
    });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

