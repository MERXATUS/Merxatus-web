import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { itemGradeLabel } from "@/server/itemGrade";
import { formatOptionRows, parseOptionsJson } from "@/server/itemOptions";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok)
      return Response.json(
        { ok: false, error: auth.error },
        { status: 401 },
      );
    const userId = auth.userId;

    const [wallet, stacks, listings, weaponInstances, toolInstances] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.inventoryStack.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ itemId: "asc" }],
    }),
    prisma.listing.findMany({
      where: { sellerId: userId, status: "ACTIVE" },
      include: { item: true, weaponInstance: { include: { baseItem: true } } },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
    }),
    prisma.weaponInstance.findMany({
      where: { userId },
      include: { baseItem: true },
      orderBy: [{ createdAt: "asc" }],
      take: 500,
    }),
    prisma.toolInstance.findMany({
      where: { userId },
      include: { baseItem: true },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    }),
  ]);

  return Response.json({
    ok: true,
    wallet: wallet ?? { userId, goldAvailable: 0, goldLocked: 0 },
    inventory: stacks.map((s) => ({
      itemId: s.itemId,
      name: s.item.name,
      category: s.item.category,
      quantity: s.quantity,
      grade: s.item.grade,
      gradeLabel: itemGradeLabel(s.item.grade),
    })),
    weaponInstances: weaponInstances.map((w) => ({
      id: w.id,
      baseItemId: w.baseItemId,
      name: w.baseItem.name,
      enhanceLevel: w.enhanceLevel,
      createdAt: w.createdAt,
      grade: w.baseItem.grade,
      gradeLabel: itemGradeLabel(w.baseItem.grade),
      options: formatOptionRows(parseOptionsJson(w.optionsJson)),
    })),
    toolInstances: toolInstances.map((t) => ({
      id: t.id,
      baseItemId: t.baseItemId,
      name: t.baseItem.name,
      createdAt: t.createdAt,
      grade: t.baseItem.grade,
      gradeLabel: itemGradeLabel(t.baseItem.grade),
      options: formatOptionRows(parseOptionsJson(t.optionsJson)),
    })),
    myListings: listings.map((l) => ({
      id: l.id,
      saleType: l.saleType,
      status: l.status,
      itemId: l.itemId,
      itemName: l.item.name,
      itemGrade: l.item.grade,
      weaponInstance: l.weaponInstance
        ? {
            id: l.weaponInstance.id,
            baseItemId: l.weaponInstance.baseItemId,
            name: l.weaponInstance.baseItem.name,
            enhanceLevel: l.weaponInstance.enhanceLevel,
            grade: l.weaponInstance.baseItem.grade,
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
    })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/me/state]", e);
    return Response.json(
      { ok: false, error: "INTERNAL", message: msg },
      { status: 500 },
    );
  }
}

