import { prisma } from "@/server/db";
import { findBotUsersOrdered } from "@/server/botRuntimeConfig";
import { GAME_RULES } from "@/server/gameRules";
import { kstDayKey } from "@/server/kst";
import { referenceUnitPrice } from "@/server/marketStats";
import { buyFixedListingPartial, createListing } from "@/server/market";

function randInt(min: number, max: number) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function syncBotBudgetRow(userId: string, dayKey: string) {
  const row = await prisma.botBudget.findUnique({ where: { userId } });
  if (!row) {
    await prisma.botBudget.create({
      data: {
        userId,
        dayKey,
        remainingBuyBudget: GAME_RULES.bots.dailyBuyBudgetGold,
      },
    });
    return;
  }

  if (row.dayKey !== dayKey) {
    await prisma.botBudget.update({
      where: { userId },
      data: {
        dayKey,
        remainingBuyBudget: GAME_RULES.bots.dailyBuyBudgetGold,
      },
    });
  }
}

async function reserveBuyBudget(userId: string, dayKey: string, grossGold: number) {
  const res = await prisma.botBudget.updateMany({
    where: {
      userId,
      dayKey,
      remainingBuyBudget: { gte: grossGold },
    },
    data: { remainingBuyBudget: { decrement: grossGold } },
  });
  return res.count === 1;
}

async function refundBuyBudget(userId: string, grossGold: number) {
  await prisma.botBudget.update({
    where: { userId },
    data: { remainingBuyBudget: { increment: grossGold } },
  });
}

function unitPriceInBand(unitPrice: number, avg: number, band: number) {
  const lo = avg * (1 - band);
  const hi = avg * (1 + band);
  return unitPrice >= lo && unitPrice <= hi;
}

export async function runMarketBotsTick() {
  const dayKey = kstDayKey();
  const rules = GAME_RULES.bots;

  const botUsers = await findBotUsersOrdered(prisma);

  if (botUsers.length === 0) {
    return { ok: true as const, dayKey, note: "NO_BOTS_FOUND", actions: [] as string[] };
  }

  const actions: string[] = [];

  for (const bot of shuffleInPlace([...botUsers])) {
    await syncBotBudgetRow(bot.id, dayKey);

    // --- BUY ---
    try {
      const listings = await prisma.listing.findMany({
        where: {
          status: "ACTIVE",
          saleType: "FIXED",
          sellerId: { not: bot.id },
        },
        include: { item: true },
        orderBy: { createdAt: "desc" },
        take: 80,
      });

      const candidates = listings.filter(
        (l) =>
          l.item.tradable &&
          l.fixedPricePerUnit &&
          l.fixedPricePerUnit > 0 &&
          l.quantity > 0,
      );

      shuffleInPlace(candidates);

      const inBand: typeof candidates = [];
      for (const l of candidates) {
        const ref = await referenceUnitPrice(l.itemId, {
          tradeTake: rules.statsLookbackTrades,
          listingTake: 40,
        });
        if (ref.ref == null) continue;
        const p = l.fixedPricePerUnit!;
        if (!unitPriceInBand(p, ref.ref, rules.priceBand)) continue;
        inBand.push(l);
      }

      if (inBand.length > 0 && Math.random() < rules.buyProbability) {
        const listing = inBand[randInt(0, inBand.length - 1)]!;
        const unit = listing.fixedPricePerUnit!;

        const bb = await prisma.botBudget.findUnique({ where: { userId: bot.id } });
        const budgetLeft = bb?.remainingBuyBudget ?? 0;

        const wallet = await prisma.wallet.findUnique({ where: { userId: bot.id } });
        const goldLeft = wallet?.goldAvailable ?? 0;

        const maxByBudget = Math.floor(budgetLeft / unit);
        const maxByWallet = Math.floor(goldLeft / unit);
        const maxQty = Math.min(listing.quantity, rules.maxBuyQtyPerTick, maxByBudget, maxByWallet);

        if (maxQty > 0) {
          const qty = randInt(1, maxQty);
          const grossGold = unit * qty;

          const reserved = await reserveBuyBudget(bot.id, dayKey, grossGold);
          if (reserved) {
            try {
              const bought = await buyFixedListingPartial({
                listingId: listing.id,
                buyerId: bot.id,
                quantity: qty,
              });
              actions.push(
                `BUY bot=${bot.username} listing=${listing.id} item=${listing.itemId} qty=${bought.bought} gross=${grossGold}`,
              );
            } catch (e) {
              await refundBuyBudget(bot.id, grossGold);
              actions.push(`BUY_FAIL bot=${bot.username} listing=${listing.id} err=${String(e)}`);
            }
          }
        }
      }
    } catch (e) {
      actions.push(`BUY_LOOP_ERR bot=${bot.username} err=${String(e)}`);
    }

    // --- SELL ---
    try {
      const stacks = await prisma.inventoryStack.findMany({
        where: { userId: bot.id, quantity: { gt: 0 } },
        include: { item: true },
      });

      const tradable = stacks.filter((s) => s.item.tradable && s.quantity > 0);
      if (tradable.length === 0) continue;

      const stack = tradable[randInt(0, tradable.length - 1)]!;
      const ref = await referenceUnitPrice(stack.itemId, {
        tradeTake: rules.statsLookbackTrades,
        listingTake: 40,
      });
      if (ref.ref == null) {
        actions.push(`SELL_SKIP bot=${bot.username} item=${stack.itemId} reason=NO_REF`);
        continue;
      }

      const lo = Math.max(1, Math.floor(ref.ref * (1 - rules.priceBand)));
      const hi = Math.max(lo, Math.floor(ref.ref * (1 + rules.priceBand)));
      const unitPrice = randInt(lo, hi);

      const maxSell = Math.min(stack.quantity, rules.maxSellQtyPerTick);
      const sellQty = randInt(1, maxSell);

      const listed = await createListing({
        sellerId: bot.id,
        itemId: stack.itemId,
        quantity: sellQty,
        saleType: "FIXED",
        fixedPricePerUnit: unitPrice,
      });

      actions.push(
        `SELL bot=${bot.username} listing=${listed.listingId} item=${stack.itemId} qty=${sellQty} unit=${unitPrice} ref=${ref.source}`,
      );
    } catch (e) {
      actions.push(`SELL_ERR bot=${bot.username} err=${String(e)}`);
    }
  }

  return { ok: true as const, dayKey, actions };
}
