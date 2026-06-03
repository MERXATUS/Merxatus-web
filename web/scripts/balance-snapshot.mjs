/**
 * 현재 구현 기준 밸런스 스냅샷 (수집 → 제작 → 강화 → 던전)
 *
 *   node scripts/balance-snapshot.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const GAME_RULES = {
  workshop: { tickSeconds: 60 },
  combat: {
    weaponPowerByItemId: {
      weapon_wood_sword: 1,
      weapon_stone_sword: 2,
      weapon_red_gold_sword: 3,
      weapon_steel_sword: 3,
      weapon_gold_sword: 5,
    },
    weaponLevelPowerPerLevel: 1,
    baseMinionPower: 5,
    levelPowerPerLevel: 1,
    fighterTraitPowerPerRank: 3,
    winRateClamp: { min: 0.05, max: 0.95 },
  },
  minion: {},
  workshopLabor: {
    matchingBonusPerMinion: 0.18,
    synergyMultAt3: 1.06,
    synergyMultAt5: 1.08,
    synergyMultAt7: 1.1,
    synergyMultAt10: 1.12,
  },
  weaponUpgrade: {
    maxLevel: 15,
  },
};

let WEAPON_ENHANCE_LEVELS = [];

function computePartyPower(members) {
  let power = 0;
  for (const m of members) {
    power += GAME_RULES.combat.baseMinionPower;
    power += Math.max(0, (Math.max(1, m.level ?? 1) - 1) * GAME_RULES.combat.levelPowerPerLevel);
    power += (m.fighterRank ?? 0) * GAME_RULES.combat.fighterTraitPowerPerRank;
    if (m.weapon) {
      const wBase = GAME_RULES.combat.weaponPowerByItemId[m.weapon] ?? 0;
      power += wBase + (m.weaponEnhance ?? 0) * GAME_RULES.combat.weaponLevelPowerPerLevel;
    }
  }
  return power;
}

function combatPowerFromMonster(m) {
  return Math.max(1, Math.floor(m.hp * 0.8 + m.atk * 4 + m.magic * 3 + m.def * 2));
}

function pickEncounterForFloor(dungeon, floor) {
  const maxFloors = dungeon.maxFloors ?? 20;
  const matches = (dungeon.encounters ?? []).filter((e) => e.fromFloor <= floor && floor <= e.toFloor);
  if (matches.length === 0) return null;
  if (floor >= maxFloors) {
    const boss = matches.find((e) => String(e.category).toUpperCase() === "BOSS");
    if (boss) return boss;
  }
  return matches.find((e) => String(e.category).toUpperCase() === "MONSTER") ?? matches[0];
}

function floorEnemyPower(dungeon, floor, monsters) {
  const enc = pickEncounterForFloor(dungeon, floor);
  if (!enc) return 1;
  const m = monsters[enc.monsterId];
  if (!m) return 1;
  return combatPowerFromMonster(m);
}

function computeWinRate(partyPower, enemyPower) {
  const raw = partyPower / (partyPower + enemyPower);
  return Math.max(0.05, Math.min(0.95, raw));
}

function weaponUpgradeCost(cur) {
  const next = cur + 1;
  const row = WEAPON_ENHANCE_LEVELS.find((r) => r.targetLevel === next);
  if (!row) throw new Error(`weapon enhance level ${next} not defined`);
  const scrolls = {};
  if (row.scrollItemId && row.scrollQty > 0) {
    scrolls[row.scrollItemId] = row.scrollQty;
  }
  return { gold: Math.max(0, Math.ceil(row.gold)), scrolls };
}

function totalEnhanceCost(from, to) {
  let gold = 0;
  const scrolls = {};
  for (let lv = from; lv < to; lv++) {
    const c = weaponUpgradeCost(lv);
    gold += c.gold;
    for (const [id, qty] of Object.entries(c.scrolls)) {
      scrolls[id] = (scrolls[id] ?? 0) + qty;
    }
  }
  return { gold, scrolls };
}

function laborScore(minions, matching) {
  const w = GAME_RULES.workshopLabor;
  let syn = 1;
  if (matching >= 3) syn *= w.synergyMultAt3;
  if (matching >= 5) syn *= w.synergyMultAt5;
  if (matching >= 7) syn *= w.synergyMultAt7;
  if (matching >= 10) syn *= w.synergyMultAt10;
  return (minions + matching * w.matchingBonusPerMinion) * syn;
}

/** 틱당 드랍 기대값 (가중치 롤, laborScore 반영) — Tier = 해당 시설 티어 전용 테이블 */
function expectedDropsPerTick(drops, tier, labor) {
  const pool = drops.filter((d) => (d.minTier ?? 1) === tier);
  const totalW = pool.reduce((a, d) => a + d.weight, 0);
  if (totalW <= 0) return {};
  const out = {};
  for (const d of pool) {
    const qty = ((d.minQty + d.maxQty) / 2) * (d.weight / totalW) * labor;
    out[d.itemId] = (out[d.itemId] ?? 0) + qty;
  }
  return out;
}

function perHour(perTick) {
  const ticks = 3600 / GAME_RULES.workshop.tickSeconds;
  const out = {};
  for (const [k, v] of Object.entries(perTick)) out[k] = v * ticks;
  return out;
}

function fmt(n, d = 1) {
  return Number(n).toLocaleString("ko-KR", { maximumFractionDigits: d });
}

function hoursFor(itemsNeeded, hourly) {
  const parts = [];
  let maxH = 0;
  for (const [itemId, need] of Object.entries(itemsNeeded)) {
    const rate = hourly[itemId] ?? 0;
    if (rate <= 0) {
      parts.push(`${itemId}: 드랍 없음`);
      maxH = Infinity;
      continue;
    }
    const h = need / rate;
    maxH = Math.max(maxH, h);
    parts.push(`${itemId}×${need} → ${fmt(h, 1)}h`);
  }
  return { hours: maxH, detail: parts.join("; ") };
}

async function main() {
  const dungeons = JSON.parse(await readFile(path.join(ROOT, "data", "dungeons.json"), "utf8"));
  const monsters = JSON.parse(await readFile(path.join(ROOT, "data", "monsters.json"), "utf8"));
  const workshops = JSON.parse(await readFile(path.join(ROOT, "data", "workshops.json"), "utf8"));
  const recipes = JSON.parse(await readFile(path.join(ROOT, "data", "recipes.json"), "utf8"));
  WEAPON_ENHANCE_LEVELS = JSON.parse(
    await readFile(path.join(ROOT, "data", "weapon_enhance_levels.json"), "utf8"),
  );
  const dungeon = dungeons[0];

  const mine = workshops.find((w) => w.name === "광산");
  const tiers = [1, 2, 3];
  const minionCounts = [1, 3, 5, 10];

  console.log("=".repeat(60));
  console.log("Merxatus 밸런스 스냅샷 (현재 구현 기준)");
  console.log("=".repeat(60));

  console.log("\n## 1. 광산 수집 (미니언 수 × 시설 티어, 광부=전원 매칭 가정)\n");
  console.log("| 티어 | 미니언 | labor | 돌/h | 적금원석/h | 금원석/h |");
  console.log("|------|--------|-------|------|------------|----------|");
  for (const tier of tiers) {
    for (const n of minionCounts) {
      const labor = laborScore(n, n);
      const perTick = expectedDropsPerTick(mine.drops, tier, labor);
      const hr = perHour(perTick);
      console.log(
        `| T${tier} | ${n}명 | ${fmt(labor, 2)} | ${fmt(hr.item_stone ?? 0, 0)} | ${fmt(hr.item_red_gold_ore ?? 0, 2)} | ${fmt(hr.item_gold_ore ?? 0, 3)} |`,
      );
    }
  }

  console.log("\n## 2. 제작 소요 시간 (돌검·금검, 전문직 일치·가공 T1)\n");
  const craftTargets = [
    { name: "돌검", recipe: recipes.find((r) => r.name === "돌검") },
    { name: "금 검", recipe: recipes.find((r) => r.name === "금 검") },
    { name: "돌 곡괭이", recipe: recipes.find((r) => r.name === "돌 곡괭이") },
  ];
  for (const tier of [1, 2, 3]) {
    const labor = laborScore(3, 3);
    const hr = perHour(expectedDropsPerTick(mine.drops, tier, labor));
    console.log(`\n### 광산 T${tier}, 광부 3명`);
    for (const t of craftTargets) {
      if (!t.recipe) continue;
      const needs = {};
      for (const inp of t.recipe.inputs) needs[inp.itemId] = inp.quantity;
      const { hours, detail } = hoursFor(needs, hr);
      const craftMin = (t.recipe.craftTimeSeconds ?? 60) / 60;
      console.log(`- **${t.name}**: 수집 ~${hours === Infinity ? "∞" : fmt(hours, 1) + "h"} (${detail}) + 제작 ${fmt(craftMin, 1)}분`);
    }
  }

  console.log("\n## 3. 던전 파티 전투력 & 층별 클리어 확률 (winRate 공식, 10인 파티)\n");
  const builds = [
    { label: "신규 Lv1×10 무기없음", members: Array.from({ length: 10 }, () => ({ level: 1 })) },
    {
      label: "초반 Lv1×10 돌검+0",
      members: Array.from({ length: 10 }, () => ({ level: 1, weapon: "weapon_stone_sword" })),
    },
    {
      label: "중반 Lv5×10 돌검+3",
      members: Array.from({ length: 10 }, () => ({ level: 5, weapon: "weapon_stone_sword", weaponEnhance: 3 })),
    },
    {
      label: "중반 Lv10×10 적금검+5",
      members: Array.from({ length: 10 }, () => ({
        level: 10,
        weapon: "weapon_red_gold_sword",
        weaponEnhance: 5,
      })),
    },
    {
      label: "후반 Lv20×10 금검+10",
      members: Array.from({ length: 10 }, () => ({
        level: 20,
        weapon: "weapon_gold_sword",
        weaponEnhance: 10,
        fighterRank: 2,
      })),
    },
  ];

  console.log("| 빌드 | 전투력 | F5 | F10 | F15 | F20(보스) |");
  console.log("|------|--------|----|----|-----|-----------|");
  for (const b of builds) {
    const pp = computePartyPower(b.members);
    const cols = [5, 10, 15, 20].map((f) => {
      const ep = floorEnemyPower(dungeon, f, monsters);
      return `${(computeWinRate(pp, ep) * 100).toFixed(0)}%`;
    });
    console.log(`| ${b.label} | ${pp} | ${cols.join(" | ")} |`);
  }

  console.log("\n## 4. 무기 강화 +0→+5 / +0→+10 / +0→+15 총 비용 (골드 + 주문서)\n");
  for (const label of ["+0→+5", "+0→+10", "+0→+15"]) {
    const to = Number(label.split("+")[2]);
    const c = totalEnhanceCost(0, to);
    const scrollParts = Object.entries(c.scrolls)
      .map(([id, qty]) => `${id} ×${qty}`)
      .join(", ");
    console.log(`- **${label}**: 골드 ${fmt(c.gold)}G${scrollParts ? `, ${scrollParts}` : " (주문서 없음)"}`);
  }

  console.log("\n## 5. PUSH_LUCK 리스크 (층당 클리어율 × 누적, 10인 돌검+0 빌드)\n");
  const earlyBuild = builds[1];
  const pp = computePartyPower(earlyBuild.members);
  let survive = 1;
  console.log("| 층 | 몬스터 power | 클리어% | 누적 생존% |");
  console.log("|----|----------|---------|------------|");
  for (let f = 1; f <= 20; f++) {
    const ep = floorEnemyPower(dungeon, f, monsters);
    const wr = computeWinRate(pp, ep);
    survive *= wr;
    console.log(`| ${f} | ${ep} | ${(wr * 100).toFixed(1)}% | ${(survive * 100).toFixed(2)}% |`);
  }

  console.log("\n## 6. 병목·미구현 이슈\n");
  const issues = [
    "item_enhance_scroll_*: +6~ 강화 필수, 드랍/획득처 CSV 미정",
    "item_slime_king_sig: 보스 드랍, items.json 미등록",
    "item_lesser_mana_stone: 던전 드랍 · 하급 강화 주문서 재료",
    "미니언 레벨업 시스템 제거 → Lv1 고정",
    "궁수/마법사 무기·레시피 없음 → 전사만 유효",
    "10인 풀파티 전제 vs 설계(1/3/5인) 불일치",
    "등급 S~D: 고용은 D 고정이나 전투력 공식에 등급 잔존",
    "recipe Success_Rate 70~95% CSV 미적용",
  ];
  for (const s of issues) console.log(`- ${s}`);

  console.log("\n" + "=".repeat(60));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
