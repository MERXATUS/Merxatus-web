import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/** CSV에 없어도 UI 수집 탭용으로 유지할 GATHER 시설 이름 */
const PRESERVE_GATHER_WORKSHOP_NAMES = [];

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= 0) return [];

  const rows = [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (cols[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, "_").replace(/-+/g, "_").toLowerCase();
}

function normalizeCategory(raw) {
  const s = String(raw ?? "").trim();
  const k = s.toLowerCase();
  if (k === "material" || k === "재료") return "재료";
  if (k === "potion" || k === "물약") return "물약";
  if (
    k === "minion_ticket" ||
    k === "ticket" ||
    k === "미니언고용권"
  ) {
    return "미니언고용권";
  }
  if (k === "weapon" || k === "무기") return "무기";
  if (k === "tool" || k === "도구") return "도구";
  if (k === "helmet" || k === "armor" || k === "pants" || k === "boots" || k === "방어구") return "방어구";
  return s || "재료";
}

/** weapons.csv·recipes 등 — id 접두사가 우선 (weapon_/tool_는 재료로 두지 않음) */
function categoryForSeedItemId(id, explicitCategoryRaw) {
  if (id.startsWith("weapon_")) return "무기";
  if (id.startsWith("tool_")) return "도구";
  if (id.startsWith("armor_")) return "방어구";
  const explicit = String(explicitCategoryRaw ?? "").trim();
  if (explicit) return normalizeCategory(explicit);
  return "재료";
}

function normalizeRecipeWorkshopName(raw) {
  const s = String(raw ?? "").trim();
  const key = s.replace(/\s+/g, "_").toLowerCase();
  if (key === "workshop_blacksmith" || key === "blacksmith" || s === "대장간") return "대장간";
  if (key === "workshop_ateliar" || key === "ateliar" || key === "atelier" || s === "공방") return "공방";
  if (key === "workshop_mine" || s === "광산") return "광산";
  if (key === "workshop_refinery" || key === "refinery" || s === "제련소") return "제련소";
  return s;
}

function parseBool(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "y" || v === "yes";
}

function parseIntSafe(raw, def = 0) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : def;
}

function parseNum(raw, def = 0) {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

function recipeMinTierFromSeedRow(r) {
  if (typeof r.minTier === "number" && Number.isFinite(r.minTier)) {
    return Math.max(1, Math.min(5, Math.floor(r.minTier)));
  }
  const m = /\([Tt](\d)\)/.exec(r.name);
  if (m) {
    const n = parseInt(m[1] ?? "1", 10);
    return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
  }
  return 1;
}

function isSeedItemId(id) {
  return (
    id.startsWith("item_") ||
    id.startsWith("weapon_") ||
    id.startsWith("tool_") ||
    id.startsWith("armor_")
  );
}

/** `a:1|b:2` 또는 단일 `Item_X` (수량 1) */
function parseRecipeInputsCell(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts = text.includes("|") ? text.split("|") : [text];
  return parts
    .map((part) => {
      const s = part.trim();
      if (!s) return null;
      const colon = s.indexOf(":");
      if (colon < 0) {
        const itemId = normalizeId(s);
        if (!isSeedItemId(itemId)) return null;
        return { itemId, quantity: 1 };
      }
      const itemId = normalizeId(s.slice(0, colon));
      const q = Math.max(1, parseIntSafe(s.slice(colon + 1), 1));
      if (!isSeedItemId(itemId)) return null;
      return { itemId, quantity: q };
    })
    .filter(Boolean);
}

/** `item_x:1-1` | `item_x:3` | `item_x` | `Weapon_X` */
function parseRecipeOutputsCell(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts = text.includes("|") ? text.split("|") : [text];
  return parts
    .map((part) => {
      const s = part.trim();
      if (!s) return null;
      const range = /^(.+):(\d+)\s*-\s*(\d+)$/.exec(s);
      if (range) {
        const itemId = normalizeId(range[1]);
        const minQty = Math.max(1, parseIntSafe(range[2], 1));
        const maxQty = Math.max(minQty, parseIntSafe(range[3], 1));
        if (!isSeedItemId(itemId)) return null;
        return { itemId, minQty, maxQty };
      }
      const one = /^(.+):(\d+)$/.exec(s);
      if (one) {
        const itemId = normalizeId(one[1]);
        const q = Math.max(1, parseIntSafe(one[2], 1));
        if (!isSeedItemId(itemId)) return null;
        return { itemId, minQty: q, maxQty: q };
      }
      const itemId = normalizeId(s);
      if (!isSeedItemId(itemId)) return null;
      return { itemId, minQty: 1, maxQty: 1 };
    })
    .filter(Boolean);
}

function parseRecipesFromRows(recipeRows) {
  return recipeRows
    .map((r) => {
      const workshopName = normalizeRecipeWorkshopName(r.WorkshopName ?? r.workshopName ?? "");
      const name = String(r.RecipeName ?? r.recipeName ?? r.name ?? "").trim();
      const minTier = Math.max(1, Math.min(5, parseIntSafe(r.MinTier ?? r.minTier ?? "", 1)));
      const craftTimeSeconds = Math.max(1, parseIntSafe(r.CraftTimeSeconds ?? r.craftTimeSeconds ?? "", 60));
      const inputs = parseRecipeInputsCell(r.Inputs ?? r.inputs ?? "");
      const outputs = parseRecipeOutputsCell(r.Outputs ?? r.outputs ?? "");
      if (!workshopName || !name || inputs.length === 0) return null;
      return {
        workshopName,
        name,
        minTier,
        craftTimeSeconds,
        inputs,
        outputs,
        rewardGold: 0,
      };
    })
    .filter(Boolean);
}

function mapItemRows(rows) {
  return rows
    .map((r) => {
      const idRaw =
        r.Id ??
        r.id ??
        r.ItemId ??
        r.itemId ??
        r.WeaponId ??
        r.weaponId ??
        r.ArmorID ??
        r.ArmorId ??
        r.armorId ??
        r.ToolID ??
        r.ToolId ??
        r.toolId;
      const name = r.Name ?? r.name ?? "";
      const tradable = parseBool(r.Tradable ?? r.tradable ?? "true");
      const grade = parseIntSafe(r.Grade ?? r.grade ?? "", 1);
      const iconRaw = r.Icon ?? r.icon ?? "";
      const icon = String(iconRaw ?? "")
        .trim()
        .replace(/\.png$/i, "");

      const id = normalizeId(idRaw);
      if (!id || !isSeedItemId(id)) return null;
      const row = {
        id,
        name: String(name ?? "").trim() || id,
        category: categoryForSeedItemId(id, r.Category ?? r.category ?? r.Categoty ?? r.categoty ?? ""),
        tradable,
        grade: Math.max(1, Math.min(8, Math.floor(grade || 1))),
      };
      if (icon) row.icon = icon;
      return row;
    })
    .filter(Boolean);
}

function mergePreserveGatherWorkshops(workshops, existingWorkshops) {
  const byName = new Map(workshops.map((w) => [w.name, w]));
  for (const name of PRESERVE_GATHER_WORKSHOP_NAMES) {
    if (byName.has(name)) continue;
    const prev = existingWorkshops.find((w) => w.name === name);
    if (prev) byName.set(name, { ...prev, drops: [] });
  }
  return Array.from(byName.values());
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const itemsCsvPath = getArg("--items");
  const dropsCsvPath = getArg("--drops");
  const recipesCsvPath = getArg("--recipes");
  const weaponsCsvPath = getArg("--weapons");
  const armorCsvPath = getArg("--armor");
  const toolsCsvPath = getArg("--tools");
  if (!itemsCsvPath || !dropsCsvPath) {
    throw new Error(
      "Usage: node scripts/replace-game-data-from-csv.mjs --items <items.csv> --drops <workshop_drops.csv> [--weapons <weapons.csv>] [--armor <armor.csv>] [--tools <tools.csv>] [--recipes <recipes.csv>]",
    );
  }

  const webRoot = process.cwd();
  const dataDir = path.join(webRoot, "data");
  const itemsJsonPath = path.join(dataDir, "items.json");
  const workshopsJsonPath = path.join(dataDir, "workshops.json");
  const recipesJsonPath = path.join(dataDir, "recipes.json");

  const itemRows = parseCsv(await readFile(itemsCsvPath, "utf8"));
  const weaponRows = weaponsCsvPath ? parseCsv(await readFile(weaponsCsvPath, "utf8")) : [];
  const armorRows = armorCsvPath ? parseCsv(await readFile(armorCsvPath, "utf8")) : [];
  const toolRows = toolsCsvPath ? parseCsv(await readFile(toolsCsvPath, "utf8")) : [];
  const dropRows = parseCsv(await readFile(dropsCsvPath, "utf8"));

  const itemsById = new Map();
  for (const row of [
    ...mapItemRows(itemRows),
    ...mapItemRows(weaponRows),
    ...mapItemRows(armorRows),
    ...mapItemRows(toolRows),
  ]) {
    itemsById.set(row.id, row);
  }

  let recipes;
  if (recipesCsvPath) {
    const recipesCsv = await readFile(recipesCsvPath, "utf8");
    recipes = parseRecipesFromRows(parseCsv(recipesCsv));
  } else {
    recipes = JSON.parse(await readFile(recipesJsonPath, "utf8"));
  }

  for (const r of Array.isArray(recipes) ? recipes : []) {
    for (const inp of r.inputs ?? []) {
      if (!isSeedItemId(inp.itemId) || itemsById.has(inp.itemId)) continue;
      itemsById.set(inp.itemId, {
        id: inp.itemId,
        name: inp.itemId,
        category: categoryForSeedItemId(inp.itemId, ""),
        tradable: true,
        grade: 1,
      });
    }
    for (const out of r.outputs ?? []) {
      if (!isSeedItemId(out.itemId) || itemsById.has(out.itemId)) continue;
      itemsById.set(out.itemId, {
        id: out.itemId,
        name: out.itemId,
        category: categoryForSeedItemId(out.itemId, ""),
        tradable: true,
        grade: 1,
      });
    }
  }

  const items = Array.from(itemsById.values());

  const byWorkshopKey = new Map();
  for (const r of dropRows) {
    const workshopId = normalizeId(r.WorkshopId ?? r.workshopId ?? "");
    const workshopName = String(r.WorkshopName ?? r.workshopName ?? "").trim();
    const itemId = normalizeId(r.ItemId ?? r.itemId ?? "");
    const weight = parseIntSafe(r.Weight ?? r.weight ?? "", 0);
    const qtyCol = parseIntSafe(r.Qty ?? r.qty ?? "", 0);
    const minQty = qtyCol > 0
      ? qtyCol
      : Math.max(1, parseIntSafe(r.MinQty ?? r.minQty ?? r.Min_Qty ?? "", 1));
    const maxQty = qtyCol > 0
      ? qtyCol
      : Math.max(1, parseIntSafe(r.MaxQty ?? r.maxQty ?? r.Max_Qty ?? "", minQty));
    const tier = Math.max(1, Math.min(5, parseIntSafe(r.Tier ?? r.tier ?? r.minTier ?? "", 1)));
    if (!workshopId || !workshopName || !itemId || !itemId.startsWith("item_")) continue;

    const key = `${workshopId}::${workshopName}`;
    const arr = byWorkshopKey.get(key) ?? [];
    arr.push({
      itemId,
      weight: Math.max(0, Math.floor(weight)),
      minQty,
      maxQty,
      minTier: tier,
    });
    byWorkshopKey.set(key, arr);
  }

  let workshops = Array.from(byWorkshopKey.entries()).map(([key, drops]) => {
    const [id, name] = key.split("::");
    return { id, name, drops };
  });

  let existingWorkshops = [];
  if (existsSync(workshopsJsonPath)) {
    try {
      existingWorkshops = JSON.parse(await readFile(workshopsJsonPath, "utf8"));
    } catch {
      existingWorkshops = [];
    }
  }
  workshops = mergePreserveGatherWorkshops(workshops, existingWorkshops);

  await writeFile(recipesJsonPath, JSON.stringify(recipes, null, 2) + "\n", "utf8");
  await writeFile(itemsJsonPath, JSON.stringify(items, null, 2) + "\n", "utf8");

  if (process.env.DATABASE_URL) {
    try {
      const { execSync } = await import("node:child_process");
      execSync("node scripts/purge-orphan-inventory.mjs", { cwd: process.cwd(), stdio: "inherit" });
    } catch (e) {
      console.warn("WARN: purge-orphan-inventory:", e?.message ?? e);
    }
  }
  await writeFile(workshopsJsonPath, JSON.stringify(workshops, null, 2) + "\n", "utf8");

  if (process.env.SKIP_DATA_DB !== "1") {
    const prisma = new PrismaClient();
    const keepItemIds = new Set(items.map((x) => x.id));
    try {
      await prisma.$transaction(
        async (tx) => {
          const existingItems = await tx.item.findMany({ select: { id: true } });
          const deleteItemIds = existingItems.map((x) => x.id).filter((id) => !keepItemIds.has(id));
          if (deleteItemIds.length) {
            await tx.weaponInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
            await tx.armorInstance.deleteMany({ where: { baseItemId: { in: deleteItemIds } } });
            await tx.listing.deleteMany({ where: { itemId: { in: deleteItemIds } } });
            await tx.inventoryStack.deleteMany({ where: { itemId: { in: deleteItemIds } } });
            await tx.userItemEnhancement.deleteMany({ where: { itemId: { in: deleteItemIds } } });
            await tx.item.deleteMany({ where: { id: { in: deleteItemIds } } });
          }

          for (const it of items) {
            const { icon: _icon, ...dbRow } = it;
            await tx.item.upsert({
              where: { id: it.id },
              create: dbRow,
              update: {
                name: dbRow.name,
                category: dbRow.category,
                tradable: dbRow.tradable,
                grade: dbRow.grade,
              },
            });
          }
        },
        { maxWait: 30_000, timeout: 120_000 },
      );
    } catch (e) {
      console.warn("WARN: Item DB sync skipped:", e?.message ?? e);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(
    `OK: items=${items.length} workshops=${workshops.length} recipes=${Array.isArray(recipes) ? recipes.length : "unchanged"} → JSON${process.env.SKIP_DATA_DB === "1" ? "" : " (+ DB items)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
