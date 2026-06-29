import {
  formatOptionValueForDisplay,
  normalizeOptionId,
  optionDisplayName,
} from "@/shared/itemOptionCatalog";
import type { CodexOptionRequirement } from "@/shared/equipmentCodexMilestones";

export type CodexOptionRow = { optionId: string; tier: number };

export function parseEquipmentOptionsForCodex(json: string | null | undefined): {
  identified: boolean;
  options: CodexOptionRow[];
} {
  if (!json || json === "[]") return { identified: true, options: [] };
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v)) return { identified: true, options: mapCodexOptionRows(v) };
    if (v && typeof v === "object") {
      const row = v as { identified?: boolean; options?: unknown };
      return {
        identified: row.identified !== false,
        options: Array.isArray(row.options) ? mapCodexOptionRows(row.options) : [],
      };
    }
  } catch {
    /* ignore */
  }
  return { identified: true, options: [] };
}

function mapCodexOptionRows(arr: unknown[]): CodexOptionRow[] {
  const out: CodexOptionRow[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const row = x as { optionId?: string; kind?: string; tier?: number };
    const rawId = row.optionId ?? row.kind;
    if (typeof rawId !== "string" || typeof row.tier !== "number") continue;
    out.push({ optionId: rawId, tier: Math.max(1, Math.floor(row.tier)) });
  }
  return out;
}

export function bestOptionDisplayValue(
  options: CodexOptionRow[],
  pool: "weapon" | "armor",
  optionId: string,
): number {
  const target = normalizeOptionId(optionId);
  let best = 0;
  for (const row of options) {
    if (normalizeOptionId(row.optionId) !== target) continue;
    const v = formatOptionValueForDisplay(row.optionId, row.tier, pool);
    if (v > best) best = v;
  }
  return best;
}

export function meetsCodexOptionRequirement(
  optionsJson: string | null | undefined,
  pool: "weapon" | "armor",
  req: CodexOptionRequirement,
): boolean {
  const payload = parseEquipmentOptionsForCodex(optionsJson);
  if (!payload.identified || payload.options.length === 0) return false;
  return bestOptionDisplayValue(payload.options, pool, req.optionId) >= req.minDisplayValue;
}

export function codexOptionRequirementDescription(
  req: CodexOptionRequirement,
  pool: "weapon" | "armor",
): string {
  const name = optionDisplayName(req.optionId, pool);
  if (name.includes("%")) {
    const base = name.replace(/\s*%+\s*$/, "").trim();
    return `${base} ${req.minDisplayValue}% 이상`;
  }
  return `${name} ${req.minDisplayValue} 이상`;
}

export function codexOptionRequirementLabel(
  req: CodexOptionRequirement,
  pool: "weapon" | "armor",
): string {
  const name = optionDisplayName(req.optionId, pool);
  if (name.includes("%")) {
    const base = name.replace(/\s*%+\s*$/, "").trim();
    return `${base} ${req.minDisplayValue}%+`;
  }
  return `${name} ${req.minDisplayValue}+`;
}
