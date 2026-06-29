/**
 * `data/csv-templates/` 의 Merxatus CSV 묶음을 JSON·DB에 반영
 *
 *   node scripts/apply-merxatus-csv-bundle.mjs
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const tpl = (...p) => path.join(process.cwd(), "data", "csv-templates", ...p);
const data = (...p) => path.join(process.cwd(), "data", ...p);

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

function runTsx(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", script], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
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

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function normalizeId(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .toLowerCase();
}

function parseNum(raw, def = 0) {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : def;
}

async function syncWeaponEnhanceLevelsFromCsv() {
  const rows = parseCsv(await readFile(tpl("weapon_enhance_levels.csv"), "utf8"));
  const levels = rows
    .map((r) => {
      const targetLevel = Math.max(1, Math.floor(parseNum(r.Target_LV ?? r.targetLevel, 0)));
      if (!targetLevel) return null;
      const scrollRaw = String(r.Scroll_Item_Id ?? r.scrollItemId ?? "").trim();
      const scrollItemId =
        !scrollRaw || scrollRaw.toLowerCase() === "none" ? null : normalizeId(scrollRaw);
      const scrollQty = Math.max(0, Math.floor(parseNum(r.Scroll_Qty ?? r.scrollQty, 0)));
      return {
        targetLevel,
        gold: Math.max(0, Math.ceil(parseNum(r.Gold_Cost ?? r.goldCost, 0))),
        scrollItemId: scrollItemId && scrollQty > 0 ? scrollItemId : null,
        scrollQty: scrollItemId && scrollQty > 0 ? scrollQty : 0,
        successRate: Math.max(0, Math.min(100, parseNum(r.SuccessRate ?? r.successRate, 100))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.targetLevel - b.targetLevel);

  if (levels.length === 0) throw new Error("weapon_enhance_levels.csv: no rows");

  await writeFile(data("weapon_enhance_levels.json"), JSON.stringify(levels, null, 2) + "\n", "utf8");

  const maxLevel = Math.max(...levels.map((r) => r.targetLevel));
  const gameRulesPath = path.join(process.cwd(), "src", "server", "gameRules.ts");
  let src = await readFile(gameRulesPath, "utf8");
  const re = /weaponUpgrade:\s*\{[\s\S]*?\},/;
  if (!re.test(src)) throw new Error("gameRules.ts: weaponUpgrade block not found");
  src = src.replace(re, `weaponUpgrade: {\n    maxLevel: ${maxLevel},\n  },`);
  await writeFile(gameRulesPath, src, "utf8");
  console.log(`OK: weapon_enhance_levels.json (${levels.length} levels, max +${maxLevel})`);
}

async function syncWeaponPowerFromCsv() {
  const csv = await readFile(tpl("weapons.csv"), "utf8");
  const rows = parseCsv(csv);
  const power = {};
  const weaponStats = {};
  for (const r of rows) {
    const id = normalizeId(r.WeaponId ?? r.weaponId);
    if (!id.startsWith("weapon_")) continue;
    const atk = parseNum(r.Atk ?? r.atk, 0);
    const magic = parseNum(r.Magic ?? r.magic, 0);
    power[id] = Math.max(1, Math.round(atk || magic || 1));
    weaponStats[id] = {
      name: r.Name ?? r.name ?? id,
      grade: Math.max(1, Math.floor(parseNum(r.Grade ?? r.grade, 1))),
      atk,
      magic,
      icon: String(r.Icon ?? r.icon ?? "").trim().replace(/\.png$/i, "") || undefined,
    };
  }

  await writeFile(data("weapon_stats.json"), JSON.stringify(weaponStats, null, 2) + "\n", "utf8");

  const gameRulesPath = path.join(process.cwd(), "src", "server", "gameRules.ts");
  let src = await readFile(gameRulesPath, "utf8");
  const block = Object.entries(power)
    .map(([k, v]) => `      ${k}: ${v},`)
    .join("\n");
  const re = /weaponPowerByItemId:\s*\{[\s\S]*?\}\s*as const,/;
  if (!re.test(src)) throw new Error("gameRules.ts: weaponPowerByItemId block not found");
  src = src.replace(re, `weaponPowerByItemId: {\n${block}\n    } as const,`);
  await writeFile(gameRulesPath, src, "utf8");
  console.log(`OK: weapon_stats.json + gameRules (${Object.keys(power).length} weapons)`);
}

async function syncArmorStatsFromCsv() {
  const rows = parseCsv(await readFile(tpl("armor.csv"), "utf8"));
  const armorStats = {};
  for (const r of rows) {
    const id = normalizeId(r.ArmorID ?? r.ArmorId ?? r.armorId);
    if (!id.startsWith("armor_")) continue;
    armorStats[id] = {
      name: r.Name ?? r.name ?? id,
      slot: String(r.Category ?? r.category ?? "").trim(),
      grade: Math.max(1, Math.floor(parseNum(r.Grade ?? r.grade, 1))),
      hp: Math.max(0, Math.floor(parseNum(r.HP ?? r.hp, 0))),
      def: Math.max(0, Math.floor(parseNum(r.Def ?? r.def, 0))),
      icon: String(r.Icon ?? r.icon ?? "").trim().replace(/\.png$/i, "") || undefined,
    };
  }
  await writeFile(data("armor_stats.json"), JSON.stringify(armorStats, null, 2) + "\n", "utf8");
  console.log(`OK: armor_stats.json (${Object.keys(armorStats).length} rows)`);
}

async function syncPotionEffectsFromCsv() {
  const rows = parseCsv(await readFile(tpl("potion.csv"), "utf8"));
  const potions = {};
  for (const r of rows) {
    const id = normalizeId(r.PotionID ?? r.potionId ?? r.ItemId ?? r.itemId);
    if (!id.startsWith("item_")) continue;
    potions[id] = {
      name: r.Name ?? r.name ?? id,
      grade: Math.max(1, Math.floor(parseNum(r.Grade ?? r.grade, 1))),
      effectType: String(r.Effect_Type ?? r.effectType ?? "").trim(),
      effectValue: String(r.Effect_Value ?? r.effectValue ?? "").trim(),
    };
  }
  await writeFile(data("potion_effects.json"), JSON.stringify(potions, null, 2) + "\n", "utf8");
  console.log(`OK: potion_effects.json (${Object.keys(potions).length} rows)`);
}

async function syncOptionTiersFromCsv(csvName, outJsonName) {
  const rows = parseCsv(await readFile(tpl(csvName), "utf8"));
  const options = {};
  for (const r of rows) {
    const id = String(r.OptionId ?? r.optionId ?? "").trim();
    if (!id) continue;
    const tiers = [];
    for (let t = 1; t <= 9; t++) {
      tiers.push(parseNum(r[`T${t}_Value`] ?? r[`t${t}_Value`], 0));
    }
    options[id] = {
      name: r.Name ?? r.name ?? id,
      tiers,
    };
  }
  await writeFile(data(outJsonName), JSON.stringify(options, null, 2) + "\n", "utf8");
  console.log(`OK: ${outJsonName} (${Object.keys(options).length} options)`);
}

async function syncWeaponOptionTiersFromCsv() {
  await syncOptionTiersFromCsv("weapon_option.csv", "weapon_option_tiers.json");
}

async function syncArmorOptionTiersFromCsv() {
  await syncOptionTiersFromCsv("armor_option.csv", "armor_option_tiers.json");
}

async function syncMonstersFromCsv() {
  const monsters = {};
  for (const file of ["monster.csv", "boss.csv"]) {
    const p = tpl(file);
    let text;
    try {
      text = await readFile(p, "utf8");
    } catch {
      continue;
    }
    for (const r of parseCsv(text)) {
      const id = normalizeId(r.Id ?? r.id ?? r.BossId ?? r.bossId);
      if (!id) continue;
      monsters[id] = {
        name: r.Name ?? r.name ?? id,
        grade: Math.max(1, Math.floor(parseNum(r.Grade ?? r.grade, 1))),
        hp: parseNum(r.Hp ?? r.hp, 0),
        atk: parseNum(r.Atk ?? r.atk, 0),
        magic: parseNum(r.Magic ?? r.magic, 0),
        as: parseNum(r.As ?? r.as, 0),
        def: parseNum(r.Def ?? r.def, 0),
      };
    }
  }
  await writeFile(data("monsters.json"), JSON.stringify(monsters, null, 2) + "\n", "utf8");
  console.log(`OK: monsters.json (${Object.keys(monsters).length} rows)`);
}

async function syncBoxOpensFromCsv() {
  const rows = parseCsv(await readFile(tpl("box_opens.csv"), "utf8"));
  const bundle = {};
  for (const r of rows) {
    const boxItemId = normalizeId(r.BoxItemId ?? r.boxItemId);
    const outputItemId = normalizeId(r.OutputItemId ?? r.outputItemId);
    if (!boxItemId.startsWith("item_box_") || !outputItemId.startsWith("item_")) continue;
    if (!bundle[boxItemId]) bundle[boxItemId] = [];
    bundle[boxItemId].push({
      itemId: outputItemId,
      weight: Math.max(0, Math.floor(parseNum(r.Weight ?? r.weight, 0))),
      minQty: Math.max(1, Math.floor(parseNum(r.Min_Qty ?? r.minQty, 1))),
      maxQty: Math.max(1, Math.floor(parseNum(r.Max_Qty ?? r.maxQty, 1))),
    });
  }
  const ids = Object.keys(bundle);
  for (const id of ids) {
    if (bundle[id].length === 0) throw new Error(`box_opens.csv: empty table for ${id}`);
  }
  await writeFile(data("box_opens.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  console.log(`OK: box_opens.json (${ids.length} boxes)`);
}

async function syncRoyalPrices() {
  await copyFile(tpl("Merxatus-Price.csv"), data("Merxatus-Price.csv"));
  const text = await readFile(data("Merxatus-Price.csv"), "utf8");
  const rows = parseCsv(text)
    .map((r) => {
      const itemId = normalizeId(r.ItemID ?? r.ItemId ?? r.itemId);
      const buy = Math.max(1, Math.floor(Number.parseInt(r.Buy_Price ?? r.BuyPrice ?? "0", 10) || 0));
      const sell = Math.max(1, Math.floor(Number.parseInt(r.Sell_Price ?? r.SellPrice ?? "0", 10) || 0));
      if (!itemId) return null;
      return buy < sell
        ? { itemId, buyPricePerUnit: sell, sellPricePerUnit: buy }
        : { itemId, buyPricePerUnit: buy, sellPricePerUnit: sell };
    })
    .filter(Boolean);

  const prisma = new PrismaClient();
  try {
    for (const r of rows) {
      await prisma.royalPrice.upsert({
        where: { itemId: r.itemId },
        create: {
          itemId: r.itemId,
          buyPricePerUnit: r.buyPricePerUnit,
          sellPricePerUnit: r.sellPricePerUnit,
          enabled: true,
        },
        update: {
          buyPricePerUnit: r.buyPricePerUnit,
          sellPricePerUnit: r.sellPricePerUnit,
          enabled: true,
        },
      });
    }
    console.log(`OK: royal prices (${rows.length} rows)`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  await runNode("scripts/replace-game-data-from-csv.mjs", [
    "--items",
    tpl("items.csv"),
    "--weapons",
    tpl("weapons.csv"),
    "--armor",
    tpl("armor.csv"),
    "--drops",
    tpl("workshop_drops.csv"),
    "--recipes",
    tpl("recipes.csv"),
  ]);

  await runNode("scripts/apply-dungeons-from-csv.mjs", []);

  await runTsx("scripts/gen-drop-tables.ts");

  await runNode("scripts/apply-raids-tower-from-csv.mjs", []);

  await syncWeaponEnhanceLevelsFromCsv();
  await syncWeaponPowerFromCsv();
  await syncArmorStatsFromCsv();
  await syncPotionEffectsFromCsv();
  await syncWeaponOptionTiersFromCsv();
  await syncArmorOptionTiersFromCsv();
  await syncMonstersFromCsv();
  await syncBoxOpensFromCsv();
  await syncRoyalPrices().catch((e) => console.warn("WARN: royal DB sync:", e.message));

  try {
    await runNode("scripts/validate-minion-csv.mjs", ["--dir", tpl()]);
  } catch (e) {
    console.warn("WARN: minion CSV validate:", e.message);
  }

  console.log("\nDone. Restart dev server after CSV changes (minion recruit cache).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
