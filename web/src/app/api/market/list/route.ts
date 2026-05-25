import { z } from "zod";
import { createListing } from "@/server/market";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const Base = z.object({
  sellerId: z.string().min(1).optional(),
  // stack item
  itemId: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  // weapon instance
  weaponInstanceId: z.string().min(1).optional(),
});

const BodySchema = z
  .discriminatedUnion("saleType", [
    Base.extend({
      saleType: z.literal("FIXED"),
      fixedPricePerUnit: z.number().int().positive().optional(),
      fixedPriceTotal: z.number().int().positive().optional(),
    }),
    Base.extend({
      saleType: z.literal("AUCTION"),
      startPrice: z.number().int().positive(),
    }),
  ])
  .refine(
    (x) =>
      (x.weaponInstanceId && !x.itemId) ||
      (!x.weaponInstanceId && !!x.itemId && typeof x.quantity === "number" && x.quantity > 0),
    { message: "INVALID_PAYLOAD" },
  );

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.sellerId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const data = parsed.data;
    const result = await createListing({
      sellerId: auth.userId,
      saleType: data.saleType,
      quantity: data.quantity ?? 1,
      weaponInstanceId: data.weaponInstanceId,
      itemId: data.itemId,
      fixedPricePerUnit: data.saleType === "FIXED" ? data.fixedPricePerUnit : undefined,
      fixedPriceTotal: data.saleType === "FIXED" ? data.fixedPriceTotal : undefined,
      startPrice: data.saleType === "AUCTION" ? data.startPrice : undefined,
    });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

