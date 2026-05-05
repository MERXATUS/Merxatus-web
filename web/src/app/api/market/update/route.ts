import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  listingId: z.string().min(1),
  saleType: z.enum(["FIXED", "AUCTION"]),
  fixedPricePerUnit: z.number().int().positive().optional(),
  fixedPriceTotal: z.number().int().positive().optional(),
  startPrice: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, null);
  if (!auth.ok)
    return Response.json(
      { ok: false, error: auth.error },
      { status: 401 },
    );

  try {
    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({ where: { id: parsed.data.listingId } });
      if (!listing) throw new Error("LISTING_NOT_FOUND");
      if (listing.status !== "ACTIVE") throw new Error("LISTING_NOT_ACTIVE");
      if (listing.sellerId !== auth.userId) throw new Error("FORBIDDEN");
      if (listing.saleType !== parsed.data.saleType) throw new Error("SALE_TYPE_MISMATCH");

      if (listing.saleType === "FIXED") {
        const unit = parsed.data.fixedPricePerUnit;
        const total = parsed.data.fixedPriceTotal;
        const wantsUnit = unit != null;
        const wantsTotal = total != null;
        if (wantsUnit === wantsTotal) throw new Error("INVALID_PRICE_MODE");
        const updated = await tx.listing.update({
          where: { id: listing.id },
          data: wantsTotal
            ? { fixedPriceTotal: Math.max(1, Math.floor(total!)), fixedPricePerUnit: null }
            : { fixedPricePerUnit: Math.max(1, Math.floor(unit!)), fixedPriceTotal: null },
        });
        return { ok: true as const, listingId: updated.id };
      }

      // AUCTION: only before any bid ? adjust start price
      if (listing.highestBidderId || listing.highestBid) throw new Error("AUCTION_HAS_BIDS");
      const start = parsed.data.startPrice;
      if (!start || start <= 0) throw new Error("AUCTION_START_PRICE_INVALID");
      const updated = await tx.listing.update({
        where: { id: listing.id },
        data: { startPrice: start },
      });
      return { ok: true as const, listingId: updated.id };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

