import { ITEM_APPRAISAL_SCROLL, ITEM_GEM_CHAOS, ITEM_GEM_DESTRUCTION } from "@/shared/optionConsumables";
import { clampItemGrade } from "@/server/itemGrade";

export const MAX_SALVAGE_BATCH = 50;

export type SalvageLootRow = { itemId: string; qty: number; label?: string };

/** 등급별 기본 마석 */
export function manaStoneItemIdForGrade(grade: number): string {
  const g = clampItemGrade(grade);
  if (g <= 2) return "item_lesser_mana_stone";
  if (g <= 5) return "item_mana_stone";
  return "item_greater_mana_stone";
}

/** 분해 확정 보상 (UI 미리보기) */
export function guaranteedSalvageLoot(grade: number, enhanceLevel: number): SalvageLootRow[] {
  const g = clampItemGrade(grade);
  const enh = Math.max(0, Math.floor(enhanceLevel));
  const stoneId = manaStoneItemIdForGrade(g);
  let qty = 1 + Math.floor(g / 3) + Math.min(3, Math.floor(enh / 4));
  if (enh >= 4) qty += 1;
  return [{ itemId: stoneId, qty }];
}

/** 분해 예상 보상 — 서버 실제 지급 (확률 보너스 포함) */
export function previewSalvageLoot(input: {
  grade: number;
  enhanceLevel: number;
  rnd?: number;
}): SalvageLootRow[] {
  const g = clampItemGrade(input.grade);
  const enh = Math.max(0, Math.floor(input.enhanceLevel));
  const out = guaranteedSalvageLoot(g, enh);

  const roll = input.rnd ?? Math.random();
  if (g >= 3 && roll < 0.08) {
    out.push({ itemId: ITEM_APPRAISAL_SCROLL, qty: 1 });
  } else if (g >= 5 && roll < 0.12) {
    const gems = [ITEM_GEM_DESTRUCTION, ITEM_GEM_CHAOS] as const;
    out.push({ itemId: gems[Math.floor(roll * 100) % gems.length]!, qty: 1 });
  }

  return mergeSalvageRows(out);
}

export function salvageBonusHintLines(grade: number): string[] {
  const g = clampItemGrade(grade);
  const lines: string[] = [];
  if (g >= 3) lines.push("8% — 감정 주문서");
  if (g >= 5) lines.push("12% — 소멸/혼돈 보석");
  return lines;
}

/** 일괄 분해 UI — 확정 보상 합산 */
export function guaranteedSalvageLootBatch(
  items: Array<{ grade: number; enhanceLevel: number }>,
): SalvageLootRow[] {
  return mergeSalvageRows(
    items.flatMap((it) => guaranteedSalvageLoot(it.grade, it.enhanceLevel)),
  );
}

export function mergeSalvageRows(rows: SalvageLootRow[]): SalvageLootRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.qty <= 0) continue;
    map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.qty);
  }
  return [...map.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}
