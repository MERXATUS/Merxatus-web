import { prisma } from "@/server/db";
import { honorTitleForPoints } from "@/server/honorTitles";
import { GAME_RULES } from "@/server/gameRules";
import { itemIconFieldsForItemId } from "@/server/itemCatalog";
import { takeAvailableFromStack } from "@/server/inventoryStackOps";
import { isRoyalMaterialRow, loadRoyalMaterialItemIds, resolveRoyalPrice } from "@/server/royalPricing";

function honorDeltaForTrade(grossGold: number) {
  // 간단 규칙: 1,000G당 1 명예(최소 1)
  return Math.max(1, Math.floor(Math.max(0, grossGold) / 1000));
}

export async function listRoyalPrices(userId: string) {
  const catalog = await loadRoyalMaterialItemIds();
  const royalItemIds = [...catalog];

  const [u0, prices, wallet] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { honorPoints: true, honorTitle: true, infamyPoints: true },
    }),
    royalItemIds.length === 0
      ? Promise.resolve([])
      : prisma.royalPrice.findMany({
          where: {
            enabled: true,
            itemId: { in: royalItemIds },
            item: { tradable: true, category: "재료" },
          },
          include: { item: { select: { id: true, name: true, category: true, grade: true, tradable: true } } },
          orderBy: [{ item: { grade: "asc" } }, { itemId: "asc" }],
          take: 200,
        }),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);
  if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
  const infamy = Math.max(0, Math.floor(u0.infamyPoints ?? 0));
  const locked = infamy >= GAME_RULES.reputation.infamyBlocksRoyalAt;

  const itemIds = prices.map((p) => p.itemId).filter(Boolean);
  const stacks =
    itemIds.length > 0
      ? await prisma.inventoryStack.findMany({
          where: { userId, itemId: { in: itemIds } },
          select: { itemId: true, quantity: true },
        })
      : [];
  const qtyByItemId = new Map(stacks.map((s) => [s.itemId, s.quantity]));

  return {
    ok: true as const,
    honorPoints: u0.honorPoints ?? 0,
    honorTitle: u0.honorTitle ?? null,
    locked,
    lockedReason: locked ? "INFAMY_TOO_HIGH_FOR_ROYAL" : null,
    goldAvailable: wallet?.goldAvailable ?? 0,
    items: await Promise.all(
      prices.map(async (p) => {
        const iconFields = await itemIconFieldsForItemId(p.itemId);
        return {
          itemId: p.itemId,
          name: p.item.name,
          category: p.item.category,
          grade: p.item.grade,
          buyPricePerUnit: p.buyPricePerUnit,
          sellPricePerUnit: p.sellPricePerUnit,
          ownedQty: qtyByItemId.get(p.itemId) ?? 0,
          icon: iconFields.icon,
          iconSrc: iconFields.iconSrc,
        };
      }),
    ),
  };
}

export async function royalBuy(input: { userId: string; itemId: string; quantity: number }) {
  const qty = Math.max(1, Math.floor(input.quantity));
  return prisma.$transaction(async (tx) => {
    const [u0, wallet] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId }, select: { honorPoints: true, infamyPoints: true } }),
      tx.wallet.findUnique({ where: { userId: input.userId } }),
    ]);
    if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
    const infamy = Math.max(0, Math.floor(u0.infamyPoints ?? 0));
    if (infamy >= GAME_RULES.reputation.infamyBlocksRoyalAt) {
      return { ok: false as const, error: "INFAMY_TOO_HIGH_FOR_ROYAL" as const };
    }
    if (!wallet) return { ok: false as const, error: "WALLET_NOT_FOUND" as const };

    const item = await tx.item.findUnique({
      where: { id: input.itemId },
      select: { id: true, name: true, category: true, grade: true, tradable: true },
    });
    if (!item) return { ok: false as const, error: "ITEM_NOT_FOUND" as const };
    const pricing = await resolveRoyalPrice(tx, item);
    if (!pricing?.enabled) return { ok: false as const, error: "ITEM_NOT_AVAILABLE" as const };
    const catalog = await loadRoyalMaterialItemIds();
    if (!isRoyalMaterialRow(item, catalog)) return { ok: false as const, error: "ITEM_NOT_ALLOWED" as const };

    const grossGold = Math.max(0, Number(pricing.buyPricePerUnit) * qty);
    if (wallet.goldAvailable < grossGold) return { ok: false as const, error: "INSUFFICIENT_GOLD" as const };

    await tx.wallet.update({ where: { userId: input.userId }, data: { goldAvailable: { decrement: grossGold } } });
    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId: input.userId, itemId: input.itemId } },
      create: { userId: input.userId, itemId: input.itemId, quantity: qty },
      update: { quantity: { increment: qty } },
    });

    const honorDelta = honorDeltaForTrade(grossGold);
    const nextHonor = Math.max(0, Math.floor((u0.honorPoints ?? 0) + honorDelta));
    const nextTitle = honorTitleForPoints(nextHonor);
    await tx.user.update({ where: { id: input.userId }, data: { honorPoints: nextHonor, honorTitle: nextTitle } });
    await tx.royalTradeLog.create({
      data: {
        userId: input.userId,
        itemId: input.itemId,
        side: "BUY",
        quantity: qty,
        goldDelta: -grossGold,
        honorDelta,
      },
    });

    return { ok: true as const, quantity: qty, goldPaid: grossGold, honorDelta };
  });
}

export async function royalSell(input: { userId: string; itemId: string; quantity: number }) {
  const qty = Math.max(1, Math.floor(input.quantity));
  return prisma.$transaction(async (tx) => {
    const [u0, wallet, stack] = await Promise.all([
      tx.user.findUnique({ where: { id: input.userId }, select: { honorPoints: true, infamyPoints: true } }),
      tx.wallet.findUnique({ where: { userId: input.userId } }),
      tx.inventoryStack.findUnique({ where: { userId_itemId: { userId: input.userId, itemId: input.itemId } } }),
    ]);
    if (!u0) return { ok: false as const, error: "USER_NOT_FOUND" as const };
    const infamy = Math.max(0, Math.floor(u0.infamyPoints ?? 0));
    if (infamy >= GAME_RULES.reputation.infamyBlocksRoyalAt) {
      return { ok: false as const, error: "INFAMY_TOO_HIGH_FOR_ROYAL" as const };
    }
    if (!wallet) return { ok: false as const, error: "WALLET_NOT_FOUND" as const };

    const item = await tx.item.findUnique({
      where: { id: input.itemId },
      select: { id: true, name: true, category: true, grade: true, tradable: true },
    });
    if (!item) return { ok: false as const, error: "ITEM_NOT_FOUND" as const };
    const pricing = await resolveRoyalPrice(tx, item);
    if (!pricing?.enabled) return { ok: false as const, error: "ITEM_NOT_AVAILABLE" as const };
    const catalog = await loadRoyalMaterialItemIds();
    if (!isRoyalMaterialRow(item, catalog)) return { ok: false as const, error: "ITEM_NOT_ALLOWED" as const };
    const available = stack ? stack.quantity - Math.max(0, stack.lockedQuantity) : 0;
    if (!stack || available < qty) {
      return {
        ok: false as const,
        error: (stack && stack.quantity >= qty ? "ITEM_LOCKED" : "INSUFFICIENT_ITEMS") as
          | "ITEM_LOCKED"
          | "INSUFFICIENT_ITEMS",
      };
    }

    const grossGold = Math.max(0, Number(pricing.sellPricePerUnit) * qty);
    await takeAvailableFromStack(tx, input.userId, input.itemId, qty);
    await tx.wallet.update({ where: { userId: input.userId }, data: { goldAvailable: { increment: grossGold } } });

    const honorDelta = honorDeltaForTrade(grossGold);
    const nextHonor = Math.max(0, Math.floor((u0.honorPoints ?? 0) + honorDelta));
    const nextTitle = honorTitleForPoints(nextHonor);
    await tx.user.update({ where: { id: input.userId }, data: { honorPoints: nextHonor, honorTitle: nextTitle } });
    await tx.royalTradeLog.create({
      data: {
        userId: input.userId,
        itemId: input.itemId,
        side: "SELL",
        quantity: qty,
        goldDelta: grossGold,
        honorDelta,
      },
    });

    return { ok: true as const, quantity: qty, goldReceived: grossGold, honorDelta };
  });
}

