/** NPC 장비 매입가 — 전투력(CP)에 비례 */

export const EQUIPMENT_SHOP_GOLD_PER_POWER = 10;
export const EQUIPMENT_SHOP_MIN_GOLD = 5;
export const EQUIPMENT_SHOP_MAX_GOLD = 2_000_000;
export const MAX_EQUIPMENT_SHOP_SELL_BATCH = 50;

/** 전투력 → 즉시 매입 골드 */
export function equipmentShopBuybackGold(combatPower: number): number {
  const power = Math.max(0, Math.floor(combatPower));
  if (power <= 0) return EQUIPMENT_SHOP_MIN_GOLD;
  const raw = power * EQUIPMENT_SHOP_GOLD_PER_POWER;
  return Math.min(
    EQUIPMENT_SHOP_MAX_GOLD,
    Math.max(EQUIPMENT_SHOP_MIN_GOLD, Math.round(raw)),
  );
}
