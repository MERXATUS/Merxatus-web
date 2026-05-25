import { z } from "zod";
import { prisma } from "@/server/db";
import { settleListing } from "@/server/market";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  listingId: z.string().min(1),
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
    // Seller-only settlement.
    // NOTE: settleAuctionListing may not re-validate seller; enforce ownership here.
    const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });
    if (!listing) return Response.json({ ok: false, error: "LISTING_NOT_FOUND" }, { status: 404 });
    if (listing.sellerId !== auth.userId)
      return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const result = await settleListing(parsed.data);
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

