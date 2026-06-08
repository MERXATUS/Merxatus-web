import type { PrismaClient } from "@prisma/client";

/** 제거된 강화 주문서 → 동급 마석 1:1 전환 (purgeOrphanInventory 전에 호출) */
const LEGACY_SCROLL_TO_MANA: ReadonlyArray<readonly [string, string]> = [
  ["item_enhance_scroll_low", "item_lesser_mana_stone"],
  ["item_enhance_scroll_mid", "item_mana_stone"],
  ["item_enhance_scroll_high", "item_greater_mana_stone"],
];

export async function migrateLegacyEnhanceScrolls(
  db: Pick<PrismaClient, "inventoryStack" | "$transaction">,
  userId: string,
): Promise<number> {
  let converted = 0;
  await db.$transaction(async (tx) => {
    for (const [fromId, toId] of LEGACY_SCROLL_TO_MANA) {
      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId, itemId: fromId } },
      });
      const qty = Math.max(0, Math.floor(stack?.quantity ?? 0));
      if (qty <= 0) continue;

      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId, itemId: toId } },
        create: { userId, itemId: toId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
      await tx.inventoryStack.delete({ where: { userId_itemId: { userId, itemId: fromId } } });
      converted += qty;
    }
  });
  return converted;
}
