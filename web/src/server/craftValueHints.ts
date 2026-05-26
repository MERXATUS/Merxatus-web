import { prisma } from "@/server/db";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { referenceUnitPrice } from "@/server/marketStats";

export type CraftValueHints = {
  primaryItemId: string;
  primaryQty: number;
  royalSellPerUnit: number | null;
  marketAvgPerUnit: number | null;
  inputCostGold: number;
  estimatedProfitRoyal: number | null;
  estimatedProfitMarket: number | null;
};

function pickPrimaryItem(input: {
  produced: Array<{ itemId: string; qty: number }>;
  craftedInstances: Array<{ itemId: string; kind?: string }>;
}) {
  const weapon = input.craftedInstances.find((c) => c.kind === "weapon" || c.itemId.startsWith("weapon_"));
  if (weapon) return { itemId: weapon.itemId, qty: 1 };
  const tool = input.craftedInstances.find((c) => c.kind === "tool" || c.itemId.startsWith("tool_"));
  if (tool) return { itemId: tool.itemId, qty: 1 };
  const first = input.produced[0];
  if (!first) return null;
  return { itemId: first.itemId, qty: Math.max(1, first.qty) };
}

export async function buildCraftValueHints(input: {
  recipeId: string;
  quantity: number;
  produced: Array<{ itemId: string; qty: number }>;
  craftedInstances: Array<{ itemId: string; kind?: string }>;
}): Promise<CraftValueHints | null> {
  const primary = pickPrimaryItem(input);
  if (!primary) return null;

  const recipe = await prisma.recipe.findUnique({
    where: { id: input.recipeId },
    include: { inputs: true },
  });
  if (!recipe) return null;

  const qty = Math.max(1, Math.floor(input.quantity));

  let inputCostGold = 0;
  for (const row of recipe.inputs) {
    const need = Math.max(0, row.quantity) * qty;
    const royal = await prisma.royalPrice.findUnique({ where: { itemId: row.itemId } });
    const unit = royal?.buyPricePerUnit ?? referenceGoldPerUnit(row.itemId);
    inputCostGold += unit * need;
  }

  const royal = await prisma.royalPrice.findUnique({ where: { itemId: primary.itemId } });
  const royalSellPerUnit = royal?.enabled ? royal.sellPricePerUnit : null;

  const market = await referenceUnitPrice(primary.itemId, { tradeTake: 40, listingTake: 24 });
  const marketAvgPerUnit = Math.max(1, Math.floor(market.ref));

  const sellTotalRoyal =
    royalSellPerUnit != null ? royalSellPerUnit * primary.qty : null;
  const sellTotalMarket = marketAvgPerUnit * primary.qty;

  return {
    primaryItemId: primary.itemId,
    primaryQty: primary.qty,
    royalSellPerUnit,
    marketAvgPerUnit,
    inputCostGold,
    estimatedProfitRoyal:
      sellTotalRoyal != null ? sellTotalRoyal - inputCostGold : null,
    estimatedProfitMarket: sellTotalMarket - inputCostGold,
  };
}
