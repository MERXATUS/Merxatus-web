import { requireAdmin } from "@/server/adminAuth";
import { prisma } from "@/server/db";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";
import { readItemsJson, writeItemsJson } from "@/server/adminData";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { loadMerxatusRoyalPriceRows } from "@/server/merxatusRoyalCsv";
import { upsertRoyalPricesFromMerxatusRows } from "@/server/applyMerxatusRoyalPrices";
import { royalPriceFromReference } from "@/server/royalPricing";
import { invalidateItemDefCache } from "@/server/grantLootToUser";
import { invalidateItemCatalogCache } from "@/server/itemCatalog";
import { z } from "zod";

export const runtime = "nodejs";

const BodyItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  tradable: z.boolean().default(true),
  grade: z.number().int().min(1).max(8).optional(),
  icon: z.string().min(1).optional(),
});
const BodySchema = z.object({
  saveFiles: z.boolean().optional(),
  items: z.array(BodyItemSchema).optional(),
});

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const bodyJson = await req.json().catch(() => null);
    const parsedBody = BodySchema.safeParse(bodyJson ?? {});

    const warnings: string[] = [];
    const usingBody = parsedBody.success && Array.isArray(parsedBody.data.items);

    const items = usingBody ? parsedBody.data.items! : (await readItemsJson()).data;

    if (usingBody && parsedBody.data.saveFiles) {
      try {
        await writeItemsJson(items);
      } catch (e) {
        const message = e instanceof Error ? e.message : "UNKNOWN";
        warnings.push(`FILE_SAVE_FAILED: ${message}`);
      }
    }

    await prisma.$transaction(async (tx) => {
      const REMOVED_ITEM_IDS = ["item_rice", "item_wheat", "item_egg", "item_milk"] as const;
      const keepItemIds = new Set(items.map((x) => x.id));
      for (const x of REMOVED_ITEM_IDS) keepItemIds.delete(x);
      const deleteCandidates = await tx.item.findMany({ select: { id: true } });
      const deleteItemIds = deleteCandidates.map((x) => x.id).filter((id) => !keepItemIds.has(id));

      if (deleteItemIds.length > 0) {
        await tx.weaponInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
        await tx.armorInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
        await tx.listing.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.inventoryStack.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.userItemEnhancement.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.royalPrice.updateMany({
          where: { itemId: { in: deleteItemIds } },
          data: { enabled: false },
        });
        await tx.item.deleteMany({ where: { id: { in: deleteItemIds } } });
      }

      for (const it of items) {
        const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
        await tx.item.upsert({
          where: { id: it.id },
          create: {
            id: it.id,
            name: it.name,
            category: it.category,
            tradable: it.tradable,
            grade,
          },
          update: { name: it.name, category: it.category, tradable: it.tradable, grade },
        });
      }

      const merxRows = await loadMerxatusRoyalPriceRows();
      const merxIds = new Set(merxRows.map((r) => r.itemId));
      if (merxRows.length > 0) {
        await upsertRoyalPricesFromMerxatusRows(tx, merxRows);
      }
      const royalTargets = items.filter((it) => it.tradable && it.category === "재료");
      const royalIdSet = new Set(royalTargets.map((it) => it.id));
      for (const it of royalTargets) {
        if (merxIds.has(it.id)) continue;
        const ref = referenceGoldPerUnit(it.id);
        const priced = royalPriceFromReference(ref, "standard");
        await tx.royalPrice.upsert({
          where: { itemId: it.id },
          create: { itemId: it.id, ...priced, enabled: true },
          update: { ...priced, enabled: true },
        });
      }
      if (royalIdSet.size > 0) {
        await tx.royalPrice.updateMany({
          where: { itemId: { notIn: [...royalIdSet] } },
          data: { enabled: false },
        });
      }
    });

    invalidateItemDefCache();
    invalidateItemCatalogCache();

    return Response.json({
      ok: true,
      source: usingBody ? "body" : "files",
      warnings,
      items: items.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
