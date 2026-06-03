import { stageOrderForDungeonId } from "@/shared/dungeonStageProgression";



/** 스테이지 order(1~8) → 강화 주문서 티어 (low/mid/high) */

export function dungeonScrollTierForStageOrder(stageOrder: number): "low" | "mid" | "high" {

  const s = Math.max(1, Math.min(8, Math.floor(stageOrder)));

  if (s <= 2) return "low";

  if (s <= 5) return "mid";

  return "high";

}



export function enhanceScrollItemId(tier: "low" | "mid" | "high"): string {

  if (tier === "low") return "item_enhance_scroll_low";

  if (tier === "mid") return "item_enhance_scroll_mid";

  return "item_enhance_scroll_high";

}



export function defaultManaStoneForStageOrder(stageOrder: number): string {

  const s = Math.max(1, Math.floor(stageOrder));

  if (s <= 2) return "item_lesser_mana_stone";

  if (s <= 5) return "item_mana_stone";

  return "item_greater_mana_stone";

}



export function dungeonLootContext(dungeonId: string) {

  const stageOrder = stageOrderForDungeonId(dungeonId) ?? 1;

  const scrollTier = dungeonScrollTierForStageOrder(stageOrder);

  return {

    stageOrder,

    scrollTier,

    scrollItemId: enhanceScrollItemId(scrollTier),

    manaStoneId: defaultManaStoneForStageOrder(stageOrder),

  };

}

