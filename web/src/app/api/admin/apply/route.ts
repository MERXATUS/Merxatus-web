import { requireAdmin } from "@/server/adminAuth";
import { prisma } from "@/server/db";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";
import { readItemsJson, readRecipesJson, readWorkshopsJson } from "@/server/adminData";
import { recipeMinTierFromSeedRow } from "@/server/recipeTier";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const [{ data: items }, { data: workshops }, { data: recipes }] = await Promise.all([
      readItemsJson(),
      readWorkshopsJson(),
      readRecipesJson(),
    ]);

    await prisma.$transaction(async (tx) => {
      // Remove deprecated workshop/types & items (e.g. farm/chicken coop) from DB as well.
      // This keeps `ensureWorkshopsForUser()` from recreating them for every user.
      const REMOVED_WORKSHOP_TYPE_NAMES = ["농장", "닭장"] as const;
      const REMOVED_ITEM_IDS = ["item_rice", "item_wheat", "item_egg", "item_milk"] as const;

      // Rename/merge legacy workshop type name: "목장" -> "벌목장"
      // - if "벌목장" already exists, move instances/drops/recipes and delete "목장"
      // - else just rename the type
      const ranch = await tx.workshopType.findUnique({ where: { name: "목장" } });
      if (ranch) {
        const lumber = await tx.workshopType.findUnique({ where: { name: "벌목장" } });
        if (lumber) {
          await tx.workshopInstance.updateMany({
            where: { workshopTypeId: ranch.id },
            data: { workshopTypeId: lumber.id },
          });
          await tx.dropTableEntry.updateMany({
            where: { workshopTypeId: ranch.id },
            data: { workshopTypeId: lumber.id },
          });
          await tx.recipe.updateMany({
            where: { workshopTypeId: ranch.id },
            data: { workshopTypeId: lumber.id },
          });
          await tx.workshopType.delete({ where: { id: ranch.id } });
        } else {
          await tx.workshopType.update({ where: { id: ranch.id }, data: { name: "벌목장" } });
        }
      }

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

      // Royal prices: fixed price table (rare materials only)
      // - buyPricePerUnit: 황실이 파는 가격(조금 비쌈)
      // - sellPricePerUnit: 황실이 사는 가격(조금 쌈)
      const royalTargets = items.filter((it) => it.tradable && it.category === "재료");
      for (const it of royalTargets) {
        const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
        if (grade > 2) continue; // 레어까지만
        const ref = referenceGoldPerUnit(it.id);
        const buyPricePerUnit = Math.max(1, Math.floor(ref * 1.15));
        const sellPricePerUnit = Math.max(1, Math.floor(ref * 0.85));
        await tx.royalPrice.upsert({
          where: { itemId: it.id },
          create: { itemId: it.id, buyPricePerUnit, sellPricePerUnit, enabled: true },
          update: { buyPricePerUnit, sellPricePerUnit, enabled: true },
        });
      }

      for (const ws of workshops) {
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

      // Recipes: group by workshopName (PROCESS/CONSUME)
      const kindByWorkshopName = new Map<string, "PROCESS" | "CONSUME">();
      for (const r of recipes) {
        const k = (r as any).rewardGold && Number((r as any).rewardGold) > 0 ? ("CONSUME" as const) : ("PROCESS" as const);
        const prev = kindByWorkshopName.get(r.workshopName);
        kindByWorkshopName.set(r.workshopName, prev === "CONSUME" || k === "CONSUME" ? "CONSUME" : "PROCESS");
      }
      const names = Array.from(kindByWorkshopName.keys());
      for (const name of names) {
        const type = await tx.workshopType.upsert({
          where: { name },
          create: { name, kind: kindByWorkshopName.get(name) ?? "PROCESS" },
          update: { kind: kindByWorkshopName.get(name) ?? "PROCESS" },
        });

        await tx.recipe.deleteMany({ where: { workshopTypeId: type.id } });
      }

      for (const r of recipes) {
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
            rewardGold: Math.max(0, Math.floor((r as any).rewardGold ?? 0)),
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
            data: r.outputs.map((o) => ({
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

    return Response.json({ ok: true, items: items.length, workshops: workshops.length, recipes: recipes.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

