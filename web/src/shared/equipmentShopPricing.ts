/** NPC 장비 매입가 — 표시 CP 기준, 강화→판매 경제 루프 중심 */

/** 표시 CP 1당 골드 (구 0.2 → 강화 판매 루프용 상향) */
export const EQUIPMENT_SHOP_GOLD_PER_POWER = 2.5;
/** 강화 단계당 추가 매입 보너스 — 강화 비용 회수·수익 구간 */
export const EQUIPMENT_SHOP_ENHANCE_BONUS_GOLD = 100;
/** 미강화 장비는 고철 취급 (뽑기 직후 즉매 방지) */
export const EQUIPMENT_SHOP_UNENHANCED_SCRAP_RATIO = 0.65;

export const EQUIPMENT_SHOP_MIN_GOLD = 15;
export const EQUIPMENT_SHOP_MAX_GOLD = 2_000_000;
export const MAX_EQUIPMENT_SHOP_SELL_BATCH = 50;

/** @deprecated UI 호환 — `COMBAT_POWER_SCALE` 도입 전 raw×10과의 대응 표기용 */
export const EQUIPMENT_SHOP_LEGACY_GOLD_PER_RAW_POWER = 10;

export type EquipmentShopBuybackParams = {
  combatPower: number;
  enhanceLevel?: number;
};

/** 전투력·강화 → 즉시 매입 골드 */
export function equipmentShopBuybackGold(combatPower: number, enhanceLevel = 0): number {
  const power = Math.max(0, Math.floor(combatPower));
  const enhance = Math.max(0, Math.floor(enhanceLevel));
  if (power <= 0 && enhance <= 0) return EQUIPMENT_SHOP_MIN_GOLD;

  let gold = power * EQUIPMENT_SHOP_GOLD_PER_POWER;
  if (enhance > 0) {
    gold += enhance * EQUIPMENT_SHOP_ENHANCE_BONUS_GOLD;
  } else {
    gold *= EQUIPMENT_SHOP_UNENHANCED_SCRAP_RATIO;
  }

  return Math.min(
    EQUIPMENT_SHOP_MAX_GOLD,
    Math.max(EQUIPMENT_SHOP_MIN_GOLD, Math.round(gold)),
  );
}

/** 장비 매입 패널 안내 문구 */
export function equipmentShopBuybackFormulaLabel(): string {
  return (
    `전투력(CP) × ${EQUIPMENT_SHOP_GOLD_PER_POWER}G` +
    ` + 강화 단계 × ${EQUIPMENT_SHOP_ENHANCE_BONUS_GOLD}G` +
    ` (미강화 ${Math.round(EQUIPMENT_SHOP_UNENHANCED_SCRAP_RATIO * 100)}%)`
  );
}
