import { normalizeItemIdLower } from "@/shared/itemId";

export const ITEM_ICON_PUBLIC_DIR = "/Icon";
/** 예전 클라이언트·캐시 URL 호환 */
export const ITEM_ICON_LEGACY_DIR = "/Items";

/** items.json에 남아 있는 stem → public/Icon 실제 파일명 */
const ICON_STEM_ALIASES: Record<string, string> = {};

function normalizeIconStem(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\.png$/i, "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.trim() ?? "";
}

function pascalParts(segments: string[]): string {
  return segments.map((s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "")).join("_");
}

/** `item_gather_minion_ticket_low` → `Icon_Gather_Minion_Ticket_Low` (public/Icon 실제 파일명) */
export function inferIconStemFromItemId(itemId: unknown): string | null {
  const id = normalizeItemIdLower(itemId);
  if (!id) return null;

  const w = id.match(/^weapon_(.+)$/);
  if (w) return `Icon_${pascalParts(w[1].split("_"))}`;

  const t = id.match(/^tool_(.+)$/);
  if (t) return `Icon_${pascalParts(t[1].split("_"))}`;

  const a = id.match(/^armor_(.+)$/);
  if (a) return `Icon_${pascalParts(a[1].split("_"))}`;

  const ore = id.match(/^item_(.+)_ore$/);
  if (ore) return `Icon_${pascalParts(ore[1].split("_"))}_Ore`;

  if (id.startsWith("item_")) {
    return `Icon_${pascalParts(id.slice(5).split("_"))}`;
  }

  return null;
}

export function resolveIconStem(raw: string | null | undefined): string {
  const stem =
    normalizeIconStem(raw) ||
    "";
  return ICON_STEM_ALIASES[stem] ?? stem;
}

/** items.json icon stem — itemId 추론 파일이 없거나 다른 아이콘을 쓸 때 */
const ITEM_ID_ICON_STEMS: Record<string, string> = {
  item_tome_celestial: "Icon_Appraisal_Scroll",
  item_tome_abyss: "Icon_Appraisal_Scroll",
  item_gem_destruction: "Icon_Mana_Stone",
  item_gem_chaos: "Icon_Greater_Mana_Stone",
  item_gem_seal: "Icon_Greater_Mana_Stone",
  item_gem_ascension: "Icon_Greater_Mana_Stone",
  item_gem_primordial: "Icon_Greater_Mana_Stone",
  item_gem_void: "Icon_Greater_Mana_Stone",
  item_gem_transfer: "Icon_Greater_Mana_Stone",
  item_gem_expansion: "Icon_Mana_Stone",
  item_gem_blessing: "Icon_Greater_Mana_Stone",
  item_craft_quality_stone: "Icon_Gem_Ascension",
  item_craft_level_tier1: "Icon_Appraisal_Scroll",
  item_craft_level_tier2: "Icon_Appraisal_Scroll",
  item_craft_level_tier3: "Icon_Appraisal_Scroll",
};

function iconStemForItem(args: { itemId: unknown; icon?: string | null | undefined }): string {
  const itemId = normalizeItemIdLower(args.itemId);
  const mapped = ITEM_ID_ICON_STEMS[itemId];
  if (mapped) return resolveIconStem(mapped);
  const raw =
    normalizeIconStem(args.icon) ||
    inferIconStemFromItemId(itemId) ||
    normalizeIconStem(itemId);
  return resolveIconStem(raw);
}

export function itemIconSrc(args: { itemId: unknown; icon?: string | null | undefined }): string {
  return `${ITEM_ICON_PUBLIC_DIR}/${iconStemForItem(args)}.png`;
}

/** API·캐시에 남은 `/Items/...` URL을 `/Icon/...`으로 교정 */
export function normalizeItemIconSrc(src: string | null | undefined): string | null {
  const trimmed = String(src ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(`${ITEM_ICON_LEGACY_DIR}/`)) {
    return `${ITEM_ICON_PUBLIC_DIR}/${trimmed.slice(ITEM_ICON_LEGACY_DIR.length + 1)}`;
  }
  return trimmed;
}

/** img onError 시 순차 시도용 (신규 /Icon → 레거시 /Items) */
export function itemIconSrcCandidates(args: {
  itemId: unknown;
  icon?: string | null | undefined;
}): string[] {
  const stem = iconStemForItem(args);
  return [`${ITEM_ICON_PUBLIC_DIR}/${stem}.png`, `${ITEM_ICON_LEGACY_DIR}/${stem}.png`];
}
