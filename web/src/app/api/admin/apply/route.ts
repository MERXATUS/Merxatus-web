import { requireAdmin } from "@/server/adminAuth";
import { prisma } from "@/server/db";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";
import { readItemsJson, readRecipesJson, readWorkshopsJson, writeItemsJson, writeRecipesJson, writeWorkshopsJson } from "@/server/adminData";
import { recipeMinTierFromSeedRow } from "@/server/recipeTier";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { loadMerxatusRoyalPriceRows } from "@/server/merxatusRoyalCsv";
import { upsertRoyalPricesFromMerxatusRows } from "@/server/applyMerxatusRoyalPrices";
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
const BodyDropSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative(),
  minQty: z.number().int().positive(),
  maxQty: z.number().int().positive(),
  minTier: z.number().int().min(1).max(5).optional(),
});
const BodyWorkshopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  drops: z.array(BodyDropSchema).min(1),
});
const BodyRecipeIOSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().positive(),
});
const BodyRecipeOutSchema = z.object({
  itemId: z.string().min(1),
  weight: z.number().int().nonnegative().optional(),
  minQty: z.number().int().positive().optional(),
  maxQty: z.number().int().positive().optional(),
});
const BodyRecipeSchema = z.object({
  workshopName: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(BodyRecipeIOSchema).min(1),
  outputs: z.array(BodyRecipeOutSchema).optional(),
  rewardGold: z.number().int().nonnegative().optional(),
  minTier: z.number().int().min(1).max(5).optional(),
  craftTimeSeconds: z.number().int().min(1).max(86400).optional(),
});
const BodySchema = z.object({
  saveFiles: z.boolean().optional(),
  items: z.array(BodyItemSchema).optional(),
  workshops: z.array(BodyWorkshopSchema).optional(),
  recipes: z.array(BodyRecipeSchema).optional(),
});

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const bodyJson = await req.json().catch(() => null);
    const parsedBody = BodySchema.safeParse(bodyJson ?? {});

    const warnings: string[] = [];
    const usingBody =
      parsedBody.success &&
      Array.isArray(parsedBody.data.items) &&
      Array.isArray(parsedBody.data.workshops) &&
      Array.isArray(parsedBody.data.recipes);

    const items = usingBody ? parsedBody.data.items! : (await readItemsJson()).data;
    const workshops = usingBody ? parsedBody.data.workshops! : (await readWorkshopsJson()).data;
    const recipes = usingBody ? parsedBody.data.recipes! : (await readRecipesJson()).data;

    // Hard removals: these contents are deprecated and must never be reintroduced via admin UI body.
    // (DB may still contain legacy rows; this endpoint should converge DB to current game content.)
    const FORBIDDEN_WORKSHOP_TYPE_NAMES = new Set<string>(["납품소", "벌목장", "산", "목장"]);
    const filteredWorkshops = workshops.filter((w) => !FORBIDDEN_WORKSHOP_TYPE_NAMES.has(w.name));
    const filteredRecipes = recipes.filter((r) => !FORBIDDEN_WORKSHOP_TYPE_NAMES.has(r.workshopName));
    if (filteredWorkshops.length !== workshops.length || filteredRecipes.length !== recipes.length) {
      warnings.push("FORBIDDEN_CONTENT_DROPPED: 납품소·벌목장·산·목장");
    }

    if (usingBody && parsedBody.data.saveFiles) {
      // Vercel/서버리스에서는 파일시스템이 read-only일 수 있어 실패해도 DB 적용은 계속 진행.
      try {
        await Promise.all([writeItemsJson(items), writeWorkshopsJson(filteredWorkshops), writeRecipesJson(filteredRecipes)]);
      } catch (e) {
        const message = e instanceof Error ? e.message : "UNKNOWN";
        warnings.push(`FILE_SAVE_FAILED: ${message}`);
      }
    }

    await prisma.$transaction(async (tx) => {
      // Remove deprecated workshop/types & items (e.g. farm/chicken coop) from DB as well.
      // This keeps `ensureWorkshopsForUser()` from recreating them for every user.
      const REMOVED_WORKSHOP_TYPE_NAMES = ["농장", "닭장", "납품소", "벌목장", "산", "목장"] as const;
      const REMOVED_ITEM_IDS = ["item_rice", "item_wheat", "item_egg", "item_milk"] as const;

      // Keep only workshop types present in current seed:
      // - Gather workshops come from `workshops.json`
      // - Process/consume workshops come from `recipes.json`
      const keepWorkshopTypeNames = new Set<string>([
        ...filteredWorkshops.map((w) => w.name),
        ...filteredRecipes.map((r) => r.workshopName),
      ]);
      // Never keep forbidden types even if they slip into input.
      for (const n of FORBIDDEN_WORKSHOP_TYPE_NAMES) keepWorkshopTypeNames.delete(n);

      // Workshop cleanup (instances -> recipes -> drops -> type)
      await tx.workshopInstance.deleteMany({
        where: { workshopType: { name: { in: [...REMOVED_WORKSHOP_TYPE_NAMES] } } },
      });
      await tx.recipe.deleteMany({
        where: { workshopType: { name: { in: [...REMOVED_WORKSHOP_TYPE_NAMES] } } },
      });
      await tx.dropTableEntry.deleteMany({
        where: { workshopType: { name: { in: [...REMOVED_WORKSHOP_TYPE_NAMES] } } },
      });
      await tx.workshopType.deleteMany({ where: { name: { in: [...REMOVED_WORKSHOP_TYPE_NAMES] } } });

      // Also delete workshop types that are no longer present in current JSON seeds (e.g. 낚시터 제거)
      // Order matters due to foreign keys.
      const existingWorkshopTypes = await tx.workshopType.findMany({ select: { id: true, name: true } });
      const deleteWorkshopTypeIds = existingWorkshopTypes
        .filter((t) => !keepWorkshopTypeNames.has(t.name))
        .map((t) => t.id);

      if (deleteWorkshopTypeIds.length > 0) {
        await tx.workshopInstance.deleteMany({ where: { workshopTypeId: { in: deleteWorkshopTypeIds } } });
        await tx.recipe.deleteMany({ where: { workshopTypeId: { in: deleteWorkshopTypeIds } } });
        await tx.dropTableEntry.deleteMany({ where: { workshopTypeId: { in: deleteWorkshopTypeIds } } });
        await tx.workshopType.deleteMany({ where: { id: { in: deleteWorkshopTypeIds } } });
      }

      // Item cleanup
      // 1) remove explicit deprecated itemIds
      // 2) additionally remove ANY itemId not present in current items.json ("재료 테이블" 기준 정리)
      const keepItemIds = new Set(items.map((x) => x.id));
      for (const x of REMOVED_ITEM_IDS) keepItemIds.delete(x);
      const deleteCandidates = await tx.item.findMany({ select: { id: true } });
      const deleteItemIds = deleteCandidates
        .map((x) => x.id)
        .filter((id) => !keepItemIds.has(id));

      if (deleteItemIds.length > 0) {
        // clear references first due to onDelete: Restrict
        await tx.weaponInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
        await tx.toolInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
        await tx.listing.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.inventoryStack.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.dropTableEntry.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.recipeInput.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.recipeOutput.deleteMany({ where: { itemId: { in: deleteItemIds } } });
        await tx.workshopInstance.updateMany({
          where: { equippedToolItemId: { in: deleteItemIds } },
          data: { equippedToolItemId: null },
        });
        await tx.userItemEnhancement.deleteMany({ where: { itemId: { in: deleteItemIds } } });
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

      // Royal: `data/Merxatus-Price.csv` 또는 `web/data/Merxatus-Price.csv`가 있으면 우선 적용, 나머지 재료는 레퍼런스 골드 기반
      const merxRows = await loadMerxatusRoyalPriceRows();
      const merxIds = new Set(merxRows.map((r) => r.itemId));
      if (merxRows.length > 0) {
        await upsertRoyalPricesFromMerxatusRows(tx, merxRows);
      }
      const royalTargets = items.filter((it) => it.tradable && it.category === "재료");
      for (const it of royalTargets) {
        if (merxIds.has(it.id)) continue;
        const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
        if (grade > 2) continue;
        const ref = referenceGoldPerUnit(it.id);
        const buyPricePerUnit = Math.max(1, Math.floor(ref * 1.15));
        const sellPricePerUnit = Math.max(1, Math.floor(ref * 0.85));
        await tx.royalPrice.upsert({
          where: { itemId: it.id },
          create: { itemId: it.id, buyPricePerUnit, sellPricePerUnit, enabled: true },
          update: { buyPricePerUnit, sellPricePerUnit, enabled: true },
        });
      }

      for (const ws of filteredWorkshops) {
        const type = await tx.workshopType.upsert({
          where: { name: ws.name },
          create: { name: ws.name, kind: "GATHER" },
          update: { kind: "GATHER" },
        });

        await tx.dropTableEntry.deleteMany({ where: { workshopTypeId: type.id } });
        await tx.dropTableEntry.createMany({
          data: ws.drops.map((d) => ({
            workshopTypeId: type.id,
            itemId: d.itemId,
            weight: d.weight,
            minQty: d.minQty,
            maxQty: d.maxQty,
            minTier: d.minTier ?? 1,
          })),
        });
      }

      // Recipes: workshop types for crafting are PROCESS only (납품소/CONSUME 시스템 제거)
      const kindByWorkshopName = new Map<string, "PROCESS">();
      for (const r of filteredRecipes) kindByWorkshopName.set(r.workshopName, "PROCESS");
      const names = Array.from(kindByWorkshopName.keys());
      for (const name of names) {
        const type = await tx.workshopType.upsert({
          where: { name },
          create: { name, kind: "PROCESS" },
          update: { kind: "PROCESS" },
        });

        await tx.recipe.deleteMany({ where: { workshopTypeId: type.id } });
      }

      for (const r of filteredRecipes) {
        const type = await tx.workshopType.findUnique({ where: { name: r.workshopName } });
        if (!type) throw new Error(`WORKSHOP_TYPE_MISSING: ${r.workshopName}`);

        const minTier = recipeMinTierFromSeedRow({
          name: r.name,
          minTier: (r as { minTier?: number }).minTier,
        });
        const recipe = await tx.recipe.create({
          data: {
            workshopTypeId: type.id,
            name: r.name,
            // 납품소(2차 소모처) 제거: rewardGold는 항상 0으로 고정
            rewardGold: 0,
            craftTimeSeconds: Math.max(1, Math.floor((r as any).craftTimeSeconds ?? 60)),
            minTier,
          },
        });

        await tx.recipeInput.createMany({
          data: r.inputs.map((i) => ({
            recipeId: recipe.id,
            itemId: i.itemId,
            quantity: i.quantity,
          })),
        });

        if ((r.outputs ?? []).length > 0) {
          await tx.recipeOutput.createMany({
            data: (r.outputs ?? []).map((o) => ({
              recipeId: recipe.id,
              itemId: o.itemId,
              weight: o.weight ?? null,
              minQty: o.minQty ?? 1,
              maxQty: o.maxQty ?? 1,
            })),
          });
        }
      }
    });

    return Response.json({
      ok: true,
      source: usingBody ? "body" : "files",
      warnings,
      items: items.length,
      workshops: workshops.length,
      recipes: recipes.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

