/**
 * 아이템 등급(1~8) 표기.
 * - **재료(수집 드랍)**: `workshops.json`의 `minTier`와 등급을 맞춤 — minTier 1→일반 … 5→전설.
 *   최종 희귀 드랍 일부만 신화·고대로 상향(에테르늄·최상 마정석·탐어·인어 등).
 * - 무기·도구·기타는 별도 밸런스 매핑.
 */
/** 무기 강화 상한(+N): 일반5 … 초월30 — `shared/weaponEnhanceLimits.ts` */
export const ITEM_GRADE_LABELS = [
  "일반",
  "레어",
  "유니크",
  "영웅",
  "전설",
  "신화",
  "고대",
  "초월",
] as const;

export type ItemGradeIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function clampItemGrade(g: number): ItemGradeIndex {
  const n = Math.floor(Number(g));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, n)) as ItemGradeIndex;
}

export function itemGradeLabel(grade: number): string {
  return ITEM_GRADE_LABELS[clampItemGrade(grade) - 1] ?? ITEM_GRADE_LABELS[0];
}

const G = {
  일반: 1,
  레어: 2,
  유니크: 3,
  영웅: 4,
  전설: 5,
  신화: 6,
  고대: 7,
  초월: 8,
} as const;

/** `items.json`의 모든 `id`에 대응. 누락 시 `defaultItemGrade`는 일반(1). */
const ITEM_GRADE_BY_ID: Record<string, number> = {
  // --- 재료: 수집 minTier = 등급(1~5). 광막·최상급 광/낚 일부만 신화·고대 상향 ---

  // --- 광산·제련 (Merxatus) ---
  item_dark_iron_ore: G.레어,
  item_red_gold_ore: G.유니크,
  item_gold_ore: G.영웅,
  item_dark_iron: G.레어,
  item_red_gold: G.유니크,

  // 광산 (레거시·기타)
  item_stone: G.일반,
  item_ore: G.일반,
  item_magic_stone_low: G.레어,
  item_mithril: G.유니크,
  item_magic_stone_mid: G.유니크,
  item_titanium: G.영웅,
  item_magic_stone_high: G.영웅,
  item_ethernium: G.신화,
  item_magic_stone_top: G.신화,

  // 산(약초)
  item_weed: G.일반,
  item_poppy: G.일반,
  item_herb: G.레어,
  item_poison_herb: G.레어,
  item_mandrake: G.유니크,
  item_snow_flower: G.영웅,
  item_immortal_herb: G.전설,

  // 벌목
  item_oak: G.일반,
  item_maple: G.일반,
  item_hard_tree: G.레어,
  item_world_tree_branch: G.유니크,
  item_thunder_tree: G.유니크,
  item_world_tree_root: G.영웅,
  item_magic_tree: G.영웅,
  item_ancient_wood: G.전설,
  item_dark_wood: G.전설,

  // 가공·던전 등 기타 재료 (희귀도에 준한 단계)
  item_wood: G.일반,
  item_mushroom: G.일반,
  item_iron: G.레어,
  item_gold: G.영웅,
  item_diamond: G.영웅,
  item_magic_stone: G.유니크,
  item_goblin_bag: G.영웅,

  // 음식 (소비·재료 느낌 반영)
  item_bread: G.일반,
  item_stew: G.레어,

  // 무기
  item_sword: G.레어,
  item_wood_sword: G.레어,
  item_iron_sword: G.유니크,
  item_mithril_sword: G.영웅,
  item_titanium_sword: G.전설,
  item_ether_sword: G.신화,

  item_wood_bow: G.레어,
  item_steel_bow: G.유니크,
  item_mithril_bow: G.영웅,
  item_titanium_bow: G.전설,
  item_ether_bow: G.신화,

  item_wood_staff: G.레어,
  item_magic_staff: G.유니크,
  item_mithril_staff: G.영웅,
  item_titanium_staff: G.전설,
  item_ether_staff: G.신화,

  item_accessory: G.레어,
  item_enhance_scroll: G.유니크,
};

export function defaultItemGradeForItemId(itemId: string): ItemGradeIndex {
  const g = ITEM_GRADE_BY_ID[itemId];
  return clampItemGrade(typeof g === "number" ? g : 1);
}

/** 아이템 이름 표시용 Tailwind 클래스 (등급별 색상) */
export function itemGradeNameClassName(grade: number): string {
  switch (clampItemGrade(grade)) {
    case 1:
      return "text-zinc-500";
    case 2:
      return "text-blue-600";
    case 3:
      return "text-purple-600";
    case 4:
      return "text-orange-500";
    case 5:
      return "text-red-600";
    case 6:
      return "font-semibold text-fuchsia-400 [text-shadow:0_0_12px_rgba(232,121,249,0.9),0_0_24px_rgba(168,85,247,0.5)]";
    case 7:
      return "font-semibold text-amber-800 [text-shadow:0_0_3px_rgba(180,83,9,0.5),0_0_8px_rgba(234,179,8,0.25)]";
    case 8:
      return "inline-block max-w-full rounded px-1 py-px font-semibold bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 text-white [box-shadow:0_0_12px_rgba(255,255,255,0.75),0_0_24px_rgba(226,232,240,0.45)]";
    default:
      return "text-zinc-900";
  }
}
