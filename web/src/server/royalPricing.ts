import type { PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";

type ItemRow = { id: string; category: string; tradable: boolean; grade: number; name: string };

export type ResolvedRoyalPrice = {
  itemId: string;
  buyPricePerUnit: number;
  sellPricePerUnit: number;
  enabled: boolean;
  source: "db" | "fallback";
};

export async function resolveRoyalPrice(
  db: Pick<PrismaClient, "royalPrice">,
  item: ItemRow,
): Promise<ResolvedRoyalPrice | null> {
  if (!item.tradable || item.category !== "재료") return null;

  const rp = await db.royalPrice.findUnique({ where: { itemId: item.id } });
  if (rp?.enabled) {
    return {
      itemId: item.id,
      buyPricePerUnit: rp.buyPricePerUnit,
      sellPricePerUnit: rp.sellPricePerUnit,
      enabled: true,
      source: "db",
    };
  }

  const ref = Math.max(1, Math.floor(referenceGoldPerUnit(item.id)));
  const buyM = GAME_RULES.royal.fallbackBuyMult;
  const sellM = GAME_RULES.royal.fallbackSellMult;
  return {
    itemId: item.id,
    buyPricePerUnit: Math.max(1, Math.floor(ref * buyM)),
    sellPricePerUnit: Math.max(1, Math.floor(ref * sellM)),
    enabled: true,
    source: "fallback",
  };
}
