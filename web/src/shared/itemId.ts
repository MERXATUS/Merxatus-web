/** API·JSON·DB에서 들어온 itemId를 안전하게 문자열로 (`.trim is not a function` 방지) */
export function normalizeItemId(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean" || typeof raw === "bigint") {
    return String(raw).trim();
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.id === "string") return o.id.trim();
    if (typeof o.itemId === "string") return o.itemId.trim();
  }
  return String(raw).trim();
}

export function normalizeItemIdLower(raw: unknown): string {
  return normalizeItemId(raw).toLowerCase();
}
