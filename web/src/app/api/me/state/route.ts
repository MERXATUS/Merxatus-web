import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { getTutorialState } from "@/server/tutorialProgress";
import { tutorialProgressPercent } from "@/shared/tutorial";
import { itemGradeLabel } from "@/server/itemGrade";
import { isCatalogItemId, loadCatalogItemIdSet } from "@/server/catalogItems";
import { purgeOrphanInventory } from "@/server/purgeOrphanInventory";
import { attachIcons, getItemIconMap, itemIconFieldsFromMap } from "@/server/itemCatalog";
import { formatOptionRows, parseOptionsJson } from "@/server/itemOptions";
import { GAME_RULES } from "@/server/gameRules";
import { needsDbMigration } from "@/server/apiRouteError";

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
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const userId = auth.userId;

    const catalogIds = await loadCatalogItemIdSet();
    await purgeOrphanInventory(prisma, { userId }).catch(() => {
      /* FK 등으로 일부만 삭제될 수 있음 — 응답은 카탈로그 필터로 보호 */
    });

    const [userAccount, tutorial, wallet, stacks, listings, weaponInstances, armorInstances, iconMap] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
        getTutorialState(prisma, userId),
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
        prisma.armorInstance.findMany({
          where: { userId, status: "OWNED" },
          include: { baseItem: true },
          orderBy: [{ createdAt: "asc" }],
          take: 500,
        }),
        getItemIconMap(),
      ]);

    const inventory = attachIcons(
      stacks
        .filter((s) => isCatalogItemId(s.itemId, catalogIds))
        .map((s) => ({
          itemId: s.itemId,
          name: s.item.name,
          category: s.item.category,
          quantity: s.quantity,
          grade: s.item.grade,
          gradeLabel: itemGradeLabel(s.item.grade),
        })),
      iconMap,
      "itemId",
    );

    return Response.json({
      ok: true,
      username: userAccount?.username ?? null,
      tutorialStep: tutorial.step,
      tutorialDone: tutorial.done,
      tutorialProgressPercent: tutorialProgressPercent(tutorial.step),
      wallet: wallet ?? { userId, goldAvailable: 0, goldLocked: 0 },
      inventory,
      weaponInstances: attachIcons(
        weaponInstances
          .filter((w) => isCatalogItemId(w.baseItemId, catalogIds))
          .map((w) => ({
          id: w.id,
          baseItemId: w.baseItemId,
          name: w.baseItem.name,
          enhanceLevel: w.enhanceLevel,
          createdAt: w.createdAt,
          grade: w.baseItem.grade,
          gradeLabel: itemGradeLabel(w.baseItem.grade),
          options: formatOptionRows(parseOptionsJson(w.optionsJson), "weapon"),
        })),
        iconMap,
        "baseItemId",
      ),
      armorInstances: attachIcons(
        armorInstances
          .filter((a) => isCatalogItemId(a.baseItemId, catalogIds))
          .map((a) => ({
          id: a.id,
          baseItemId: a.baseItemId,
          name: a.baseItem.name,
          createdAt: a.createdAt,
          grade: a.baseItem.grade,
          gradeLabel: itemGradeLabel(a.baseItem.grade),
          options: formatOptionRows(parseOptionsJson(a.optionsJson), "armor"),
        })),
        iconMap,
        "baseItemId",
      ),
      market: {
        maxActiveListings: GAME_RULES.market.maxActiveListingsPerUser,
        listingDurationHours: GAME_RULES.market.listingDurationSeconds / 3600,
        activeListingCount: listings.length,
      },
      myListings: listings.map((l) => {
        const iconItemId = l.weaponInstance?.baseItemId ?? l.itemId;
        const { icon, iconSrc } = itemIconFieldsFromMap(iconItemId, iconMap);
        return {
          id: l.id,
          saleType: l.saleType,
          itemId: l.itemId,
          itemName: l.weaponInstance?.baseItem.name ?? l.item.name,
          quantity: l.quantity,
          fixedPricePerUnit: l.fixedPricePerUnit,
          fixedPriceTotal: l.fixedPriceTotal,
          startPrice: l.startPrice,
          endsAt: l.endsAt?.toISOString() ?? null,
          highestBid: l.highestBid,
          weaponInstanceId: l.weaponInstanceId,
          enhanceLevel: l.weaponInstance?.enhanceLevel ?? null,
          icon,
          iconSrc,
        };
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (needsDbMigration(msg)) {
      return Response.json(
        { ok: false, error: "DB_MIGRATION_REQUIRED", message: "DB 마이그레이션이 필요합니다." },
        { status: 503 },
      );
    }
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR", message: msg }, { status: 500 });
  }
}
