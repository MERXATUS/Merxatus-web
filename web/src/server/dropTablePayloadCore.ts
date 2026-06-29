import { loadCatalogItemNameMap } from "@/server/catalogItems";
import { getItemIconMap, itemIconFieldsFromMap } from "@/server/itemCatalog";
import { itemGradeViewForItem } from "@/server/itemGrade";
import type { DungeonDropTableSection } from "@/shared/dungeonDropTable";
import type { DungeonDropTableEntryView } from "@/shared/dungeonDropTableView";
import { normalizeItemIdLower } from "@/shared/itemId";

export function dropItemCategory(
  itemId: string,
  categoryRaw: string,
): DungeonDropTableEntryView["category"] {
  const id = normalizeItemIdLower(itemId);
  if (id.startsWith("weapon_") || id.startsWith("armor_")) return "equipment";
  if (categoryRaw === "물약" || categoryRaw === "음식") return "consumable";
  if (categoryRaw === "재료") return "material";
  return "other";
}

export function enrichDropTableSection(
  section: DungeonDropTableSection,
  catalogNames: Map<string, string>,
  iconMap: Awaited<ReturnType<typeof getItemIconMap>>,
  itemCategoryById: Map<string, string>,
) {
  return {
    id: section.id,
    label: section.label,
    kind: section.kind,
    floorMin: section.floorMin,
    floorMax: section.floorMax,
    rows: section.rows.map((row) => {
      const id = normalizeItemIdLower(row.itemId);
      const { icon, iconSrc } = itemIconFieldsFromMap(id, iconMap);
      const gradeView = itemGradeViewForItem(id);
      const cat = itemCategoryById.get(id) ?? "other";
      return {
        itemId: id,
        name: catalogNames.get(id) ?? id,
        grade: gradeView.grade ?? 1,
        gradeLabel: gradeView.gradeLabel ?? "",
        icon,
        iconSrc,
        chancePct: row.chancePct,
        minQty: row.minQty,
        maxQty: row.maxQty,
        floorLabel: row.floorLabel,
        category: dropItemCategory(id, cat),
      };
    }),
  };
}

export async function loadDropTableCatalogContext() {
  const [catalogNames, iconMap, itemsJson] = await Promise.all([
    loadCatalogItemNameMap(),
    getItemIconMap(),
    import("@/server/adminData").then((m) => m.readItemsJson()),
  ]);
  const itemCategoryById = new Map(
    itemsJson.data.map((it) => [normalizeItemIdLower(it.id), it.category] as const),
  );
  return { catalogNames, iconMap, itemCategoryById };
}

export async function readStaticDataJson<T>(filename: string): Promise<T | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const fsPath = await import("node:path");
    const candidates = [
      fsPath.join(process.cwd(), "data", filename),
      fsPath.join(process.cwd(), "web", "data", filename),
    ];
    for (const p of candidates) {
      try {
        const raw = await readFile(p, "utf8");
        const parsed = JSON.parse(raw) as T;
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        /* try next */
      }
    }
    return null;
  } catch {
    return null;
  }
}
