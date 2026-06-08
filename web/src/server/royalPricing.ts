import type { PrismaClient } from "@prisma/client";
import { readItemsJson } from "@/server/adminData";
import { GAME_RULES } from "@/server/gameRules";
import { referenceGoldPerUnit } from "@/server/itemReferenceGold";
import { normalizeItemIdLower } from "@/shared/itemId";

type ItemRow = { id: string; category: string; tradable: boolean; grade: number; name: string };

export type ResolvedRoyalPrice = {
  itemId: string;
  buyPricePerUnit: number;
  sellPricePerUnit: number;
  enabled: boolean;
  source: "db" | "fallback";
};

let royalMaterialIdSet: Set<string> | null = null;

/** `items.json` — tradable + category 재료만 황실 거래 대상 */
export async function loadRoyalMaterialItemIds(): Promise<Set<string>> {
  if (royalMaterialIdSet) return royalMaterialIdSet;
  const { data } = await readItemsJson();
  royalMaterialIdSet = new Set(
    data
      .filter((it) => it.tradable && it.category === "재료")
      .map((it) => normalizeItemIdLower(it.id)),
  );
  return royalMaterialIdSet;
}

export function invalidateRoyalMaterialCache() {
  royalMaterialIdSet = null;
}

export function isRoyalMaterialItemId(itemId: unknown, catalog: Set<string>): boolean {
  const id = normalizeItemIdLower(itemId);
  return id.length > 0 && catalog.has(id);
}

export function isRoyalMaterialRow(
  item: { id: string; category: string; tradable: boolean },
  catalog: Set<string>,
): boolean {
  return item.tradable && item.category === "재료" && isRoyalMaterialItemId(item.id, catalog);
}

/** 기준가(ref) → 황실 구매·판매가 (GAME_RULES.royal 배율) */
export function royalPriceFromReference(
  refGold: number,
  spread: "standard" | "consumable" = "standard",
) {
  const ref = Math.max(1, Math.floor(refGold));
  if (spread === "consumable") {
    return {
      buyPricePerUnit: Math.max(1, Math.ceil(ref * 1.1)),
      sellPricePerUnit: Math.max(1, Math.floor(ref * 0.9)),
    };
  }
  const buyM = GAME_RULES.royal.fallbackBuyMult;
  const sellM = GAME_RULES.royal.fallbackSellMult;
  return {
    buyPricePerUnit: Math.max(1, Math.floor(ref * buyM)),
    sellPricePerUnit: Math.max(1, Math.floor(ref * sellM)),
  };
}

export async function resolveRoyalPrice(
  db: Pick<PrismaClient, "royalPrice">,
  item: ItemRow,
): Promise<ResolvedRoyalPrice | null> {
  const catalog = await loadRoyalMaterialItemIds();
  if (!isRoyalMaterialRow(item, catalog)) return null;

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
  const spread = isRoyalConsumableItemId(item.id) ? "consumable" : "standard";
  const priced = royalPriceFromReference(ref, spread);
  return {
    itemId: item.id,
    ...priced,
    enabled: true,
    source: "fallback",
  };
}

const ROYAL_CONSUMABLE_ITEM_IDS = new Set([
  "item_lesser_mana_stone",
  "item_mana_stone",
  "item_greater_mana_stone",
  "item_appraisal_scroll",
]);

function isRoyalConsumableItemId(itemId: string) {
  return ROYAL_CONSUMABLE_ITEM_IDS.has(itemId.trim().toLowerCase());
}
