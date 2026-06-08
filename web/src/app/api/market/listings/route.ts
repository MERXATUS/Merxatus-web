import { z } from "zod";
import { prisma } from "@/server/db";
import { itemIconFieldsForItemId } from "@/server/itemCatalog";
import { itemGradeViewForItem } from "@/server/itemGrade";
import { activeListingVisibilityWhere, expireStaleActiveListings } from "@/server/market";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().optional(),
  saleType: z.enum(["FIXED", "AUCTION"]).optional(),
  sort: z.enum(["NEWEST", "PRICE_ASC", "ENDS_SOON"]).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    saleType: url.searchParams.get("saleType") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const { q, saleType, sort, take } = parsed.data;

  await expireStaleActiveListings({ limit: 100 });

  const where: any = {
    status: "ACTIVE",
    AND: [
      activeListingVisibilityWhere(),
      ...(saleType ? [{ saleType }] : []),
      ...(q
        ? [
            {
              OR: [
                { id: { contains: q } },
                { item: { name: { contains: q } } },
                { itemId: { contains: q } },
              ],
            },
          ]
        : []),
    ],
  };

  const orderBy =
    sort === "PRICE_ASC"
      ? [{ fixedPricePerUnit: "asc" as const }, { fixedPriceTotal: "asc" as const }, { createdAt: "desc" as const }]
      : sort === "ENDS_SOON"
        ? [{ endsAt: "asc" as const }, { createdAt: "desc" as const }]
        : [{ createdAt: "desc" as const }];

  const listings = await prisma.listing.findMany({
    where,
    include: { item: true, weaponInstance: { include: { baseItem: true } } },
    orderBy,
    take: take ?? 50,
  });

  const mapped = await Promise.all(
    listings.map(async (l) => {
      const iconItemId = l.weaponInstance?.baseItemId ?? l.itemId;
      const iconFields = await itemIconFieldsForItemId(iconItemId);
      return {
        id: l.id,
        saleType: l.saleType,
        status: l.status,
        sellerId: l.sellerId,
        itemId: l.itemId,
        itemName: l.item.name,
        itemGrade: itemGradeViewForItem(l.itemId, l.item.grade).grade,
        category: l.item.category,
        icon: iconFields.icon,
        iconSrc: iconFields.iconSrc,
        weapon: l.weaponInstance
          ? {
              id: l.weaponInstance.id,
              baseItemId: l.weaponInstance.baseItemId,
              name: l.weaponInstance.baseItem.name,
              enhanceLevel: l.weaponInstance.enhanceLevel,
              status: l.weaponInstance.status,
              ...itemGradeViewForItem(
                l.weaponInstance.baseItemId,
                l.weaponInstance.baseItem.grade,
              ),
            }
          : null,
        quantity: l.quantity,
        fixedPricePerUnit: l.fixedPricePerUnit,
        fixedPriceTotal: l.fixedPriceTotal,
        startPrice: l.startPrice,
        endsAt: l.endsAt,
        highestBid: l.highestBid,
        highestBidderId: l.highestBidderId,
        createdAt: l.createdAt,
      };
    }),
  );

  return Response.json({ ok: true, listings: mapped });
}

