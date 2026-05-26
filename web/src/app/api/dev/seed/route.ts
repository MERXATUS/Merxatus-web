import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import { getConfiguredBotCount } from "@/server/botRuntimeConfig";
import { ensureBotUsers } from "@/server/ensureBotUsers";
import { loadSeedData } from "@/server/seedData";
import { clampItemGrade, defaultItemGradeForItemId } from "@/server/itemGrade";
import { recipeMinTierFromSeedRow } from "@/server/recipeTier";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { loadMerxatusRoyalPriceRows } from "@/server/merxatusRoyalCsv";
import { upsertRoyalPricesFromMerxatusRows } from "@/server/applyMerxatusRoyalPrices";
import { setUserSpecialistUnlockedTrue } from "@/server/userSpecialistDb";
import { guardDevApi } from "@/server/devApiGuard";

export const runtime = "nodejs";

export async function POST() {
  const blocked = guardDevApi();
  if (blocked) return blocked;

  try {
    return await runSeed();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/dev/seed]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

async function runSeed() {
  const { items, workshops, recipes } = await loadSeedData();

  const seller = await prisma.user.upsert({
    where: { username: "dev_seller" },
    create: { username: "dev_seller" },
    update: {},
  });

  await prisma.wallet.upsert({
    where: { userId: seller.id },
    create: { userId: seller.id, goldAvailable: 1000, goldLocked: 0 },
    update: { goldAvailable: 1000, goldLocked: 0 },
  });

  const buyer = await prisma.user.upsert({
    where: { username: "dev_buyer" },
    create: { username: "dev_buyer" },
    update: {},
  });
  await setUserSpecialistUnlockedTrue(prisma, buyer.id);

  await prisma.minionInventory.upsert({
    where: { userId: buyer.id },
    create: { userId: buyer.id, owned: 1, gatherOwned: 1, dungeonOwned: 0 },
    update: {},
  });

  await prisma.wallet.upsert({
    where: { userId: buyer.id },
    create: { userId: buyer.id, goldAvailable: 1000, goldLocked: 0 },
    update: { goldAvailable: 1000, goldLocked: 0 },
  });

  // Items
  for (const it of items) {
    const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
    await prisma.item.upsert({
      where: { id: it.id },
      create: { id: it.id, name: it.name, category: it.category, tradable: it.tradable, grade },
      update: { name: it.name, category: it.category, tradable: it.tradable, grade },
    });
  }

  // Royal: Merxatus-Price.csv 우선, 나머지 재료(≤레어)는 레퍼런스 골드 기반
  const merxRows = await loadMerxatusRoyalPriceRows();
  const merxIds = new Set(merxRows.map((r) => r.itemId));
  if (merxRows.length > 0) {
    await upsertRoyalPricesFromMerxatusRows(prisma, merxRows);
  }
  for (const it of items) {
    if (!it.tradable || it.category !== "재료") continue;
    if (merxIds.has(it.id)) continue;
    const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
    if (grade > 2) continue;
    const ref = referenceGoldPerUnit(it.id);
    const buyPricePerUnit = Math.max(1, Math.floor(ref * 1.15));
    const sellPricePerUnit = Math.max(1, Math.floor(ref * 0.85));
    await prisma.royalPrice.upsert({
      where: { itemId: it.id },
      create: { itemId: it.id, buyPricePerUnit, sellPricePerUnit, enabled: true },
      update: { buyPricePerUnit, sellPricePerUnit, enabled: true },
    });
  }

  // Black market: DB 배수는 1로 두고, 시세 변동은 서버 시간(UTC) 기준 5분 슬롯 로직으로 계산
  for (const it of items) {
    if (!it.tradable || it.category !== "재료") continue;
    const grade = clampItemGrade(it.grade ?? defaultItemGradeForItemId(it.id));
    if (grade > 2) continue;
    await prisma.blackMarketPrice.upsert({
      where: { itemId: it.id },
      create: { itemId: it.id, multiplier: 1 },
      update: { multiplier: 1 },
    });
  }

  // Black market event: one short-lived event for quick testing
  const now = new Date();
  const startsAt = new Date(now.getTime() - 5 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 55 * 60 * 1000);
  const kind = Math.random() < 0.5 ? "BOOM" : "CRASH";
  const mult = Math.random() < 0.5 ? 1.4 : 0.7;
  await prisma.blackMarketEvent.create({
    data: { kind, category: "재료", itemId: null, multiplier: mult, startsAt, endsAt },
  });

  const { botIds, botUsernames, botsFound, botsExpected } = await ensureBotUsers(getConfiguredBotCount());

  // Workshops + drops
  for (const ws of workshops) {
    const type = await prisma.workshopType.upsert({
      where: { name: ws.name },
      create: { name: ws.name, kind: "GATHER" },
      update: { kind: "GATHER" },
    });

    await prisma.dropTableEntry.deleteMany({ where: { workshopTypeId: type.id } });
    await prisma.dropTableEntry.createMany({
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

  // Recipes (PROCESS/CONSUME)
  const kindByWorkshopName = new Map<string, "PROCESS" | "CONSUME">();
  for (const r of recipes) {
    const k = (r as any).rewardGold && Number((r as any).rewardGold) > 0 ? ("CONSUME" as const) : ("PROCESS" as const);
    const prev = kindByWorkshopName.get(r.workshopName);
    kindByWorkshopName.set(r.workshopName, prev === "CONSUME" || k === "CONSUME" ? "CONSUME" : "PROCESS");
  }
  const recipeWorkshopNames = Array.from(kindByWorkshopName.keys());
  for (const name of recipeWorkshopNames) {
    const type = await prisma.workshopType.upsert({
      where: { name },
      create: { name, kind: kindByWorkshopName.get(name) ?? "PROCESS" },
      update: { kind: kindByWorkshopName.get(name) ?? "PROCESS" },
    });
    await prisma.recipe.deleteMany({ where: { workshopTypeId: type.id } });
  }
  for (const r of recipes) {
    const type = await prisma.workshopType.findUnique({ where: { name: r.workshopName } });
    if (!type) throw new Error(`WORKSHOP_TYPE_MISSING: ${r.workshopName}`);

    const minTier = recipeMinTierFromSeedRow({
      name: r.name,
      minTier: (r as { minTier?: number }).minTier,
    });
    const recipe = await prisma.recipe.create({
      data: {
        workshopTypeId: type.id,
        name: r.name,
        rewardGold: Math.max(0, Math.floor((r as any).rewardGold ?? 0)),
        craftTimeSeconds: Math.max(1, Math.floor((r as any).craftTimeSeconds ?? 60)),
        minTier,
      },
    });
    await prisma.recipeInput.createMany({
      data: r.inputs.map((i) => ({ recipeId: recipe.id, itemId: i.itemId, quantity: i.quantity })),
    });
    if ((r.outputs ?? []).length > 0) {
      await prisma.recipeOutput.createMany({
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

  const workshopInstances: Array<{ id: string; name: string }> = [];
  for (const ws of workshops) {
    const type = await prisma.workshopType.findUnique({ where: { name: ws.name } });
    if (!type) throw new Error("WORKSHOP_TYPE_MISSING");

    const instanceId = `workshop_dev_${ws.id}`;
    const inst = await prisma.workshopInstance.upsert({
      where: { id: instanceId },
      create: {
        id: instanceId,
        userId: buyer.id,
        workshopTypeId: type.id,
        minionCount: ws.id === "workshop_mine" ? 1 : 0,
        lastCollectedAt: new Date(Date.now() - 5 * GAME_RULES.workshop.tickSeconds * 1000),
      },
      update: {
        userId: buyer.id,
        workshopTypeId: type.id,
        minionCount: ws.id === "workshop_mine" ? 1 : 0,
      },
    });

    workshopInstances.push({ id: inst.id, name: ws.name });
  }

  // Ensure process workshop instances for dev_buyer as well
  for (const name of recipeWorkshopNames) {
    const type = await prisma.workshopType.findUnique({ where: { name } });
    if (!type) continue;
    const instanceId = `workshop_dev_process_${type.id}`;
    const inst = await prisma.workshopInstance.upsert({
      where: { id: instanceId },
      create: {
        id: instanceId,
        userId: buyer.id,
        workshopTypeId: type.id,
        minionCount: 0,
        lastCollectedAt: new Date(),
      },
      update: { userId: buyer.id, workshopTypeId: type.id },
    });
    workshopInstances.push({ id: inst.id, name });
  }

  // Ensure the user has some items to sell (this seed treats listings as escrowed: inventory is reduced accordingly)
  const oreId = "item_dark_iron";
  await prisma.inventoryStack.upsert({
    where: { userId_itemId: { userId: seller.id, itemId: oreId } },
    create: { userId: seller.id, itemId: oreId, quantity: 50 },
    update: { quantity: 50 },
  });

  const fixedListing = await prisma.listing.upsert({
    where: { id: "listing_fixed_ore" },
    create: {
      id: "listing_fixed_ore",
      saleType: "FIXED",
      status: "ACTIVE",
      sellerId: seller.id,
      itemId: oreId,
      quantity: 10,
      fixedPricePerUnit: 10,
    },
    update: {
      status: "ACTIVE",
      quantity: 10,
      fixedPricePerUnit: 10,
    },
  });


  // Apply escrow (remove listed quantities from seller inventory)
  await prisma.inventoryStack.update({
    where: { userId_itemId: { userId: seller.id, itemId: oreId } },
    data: { quantity: { decrement: fixedListing.quantity } },
  });

  // 봇/시세가 "최근 거래 평균"을 참조할 수 있도록, 광석의 단가 신호를 한 건 심어둔다(개발용).
  const bootGross = fixedListing.fixedPricePerUnit ?? 10;
  const bootFee = Math.floor((bootGross * GAME_RULES.market.feeBps) / 10_000);
  await prisma.transaction.create({
    data: {
      listingId: fixedListing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      itemId: oreId,
      quantity: 1,
      saleType: "FIXED",
      grossGold: bootGross,
      feeGold: bootFee,
      netGold: bootGross - bootFee,
    },
  });

  return Response.json({
    ok: true,
    sellerId: seller.id,
    buyerId: buyer.id,
    userId: buyer.id,
    botIds,
    botUsernames,
    botsFound,
    botsExpected,
    workshopIds: workshopInstances,
    workshopId: workshopInstances[0]?.id,
    fixedListingId: fixedListing.id,
    auctionListingId: null,
  });
}

