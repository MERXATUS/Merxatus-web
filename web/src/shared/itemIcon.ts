export const ITEM_ICON_PUBLIC_DIR = "/Items";

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

/** `item_gather_minion_ticket_low` → `Icon_Gather_Minion_Ticket_Low` (public/Items 실제 파일명) */
export function inferIconStemFromItemId(itemId: string): string | null {
  const id = itemId.trim().toLowerCase();

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

export function itemIconSrc(args: { itemId: string; icon?: string | null | undefined }): string {
  const stem =
    normalizeIconStem(args.icon) ||
    inferIconStemFromItemId(args.itemId) ||
    normalizeIconStem(args.itemId);
  return `${ITEM_ICON_PUBLIC_DIR}/${stem}.png`;
}
