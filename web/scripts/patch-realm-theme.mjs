/**
 * 천계·마계·이계 테마 — 던전·몬스터·레이드·무탑 표시명 동기화
 * node scripts/patch-realm-theme.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const DUNGEON_NAMES = {
  dungeon_slime_forest: "마계 · 오염의 웅덩이",
  dungeon_goblin_den: "마계 · 군번의 심굴",
  dungeon_wolf_ravine: "마계 · 피의 사구",
  dungeon_crypt_of_dead: "천계 · 낙천자의 묘",
  dungeon_scorch_rift: "천계 · 심판의 화염",
  dungeon_frost_citadel: "천계 · 서릿빛 성벽",
  dungeon_dragon_roost: "이계 · 차원 용혈",
  dungeon_void_rift: "이계 · 공허 균열",
};

const CSV_DUNGEON_NAMES = {
  Dungeon_Slime_Forest: DUNGEON_NAMES.dungeon_slime_forest,
  Dungeon_Goblin_Den: DUNGEON_NAMES.dungeon_goblin_den,
  Dungeon_Wolf_Ravine: DUNGEON_NAMES.dungeon_wolf_ravine,
  Dungeon_Crypt_Of_Dead: DUNGEON_NAMES.dungeon_crypt_of_dead,
  Dungeon_Scorch_Rift: DUNGEON_NAMES.dungeon_scorch_rift,
  Dungeon_Frost_Citadel: DUNGEON_NAMES.dungeon_frost_citadel,
  Dungeon_Dragon_Roost: DUNGEON_NAMES.dungeon_dragon_roost,
  Dungeon_Void_Rift: DUNGEON_NAMES.dungeon_void_rift,
};

const MONSTER_NAMES = {
  slime: "마염혈",
  goblin: "마계 군번",
  wolf: "마수 사냥개",
  skeleton: "낙천자 유골",
  fire_salamander: "심판의 화령",
  ice_wisp: "서릿빛 성령",
  dragon_whelp: "이계 유룡",
  void_spawn: "공허 원생",
  slime_king: "마염 군주",
  goblin_chieftain: "군번장",
  wolf_alpha: "마수왕",
  skeleton_lord: "낙천 장군",
  flame_tyrant: "심판의 폭군",
  frost_titan: "서릿빛 거신",
  elder_dragon: "차원 고룡",
  void_harbinger: "이계 사자",
  void_overlord: "공허 군주",
};

const CSV_MONSTER = {
  Slime: "마염혈",
  Goblin: "마계 군번",
  Wolf: "마수 사냥개",
  Skeleton: "낙천자 유골",
  Fire_Salamander: "심판의 화령",
  Ice_Wisp: "서릿빛 성령",
  Dragon_Whelp: "이계 유룡",
  Void_Spawn: "공허 원생",
};

const CSV_BOSS = {
  Slime_King: "마염 군주",
  Goblin_Chieftain: "군번장",
  Wolf_Alpha: "마수왕",
  Skeleton_Lord: "낙천 장군",
  Flame_Tyrant: "심판의 폭군",
  Frost_Titan: "서릿빛 거신",
  Elder_Dragon: "차원 고룡",
  Void_Harbinger: "이계 사자",
  Void_Overlord: "공허 군주",
};

const STAGE_NAMES = [
  "오염의 웅덩이",
  "군번의 심굴",
  "피의 사구",
  "낙천자의 묘",
  "심판의 화염",
  "서릿빛 성벽",
  "차원 용혈",
  "공허 균열",
];

async function patchDungeonsJson() {
  const p = path.join(root, "data/dungeons.json");
  const dungeons = JSON.parse(await readFile(p, "utf8"));
  for (const d of dungeons) {
    if (DUNGEON_NAMES[d.id]) d.name = DUNGEON_NAMES[d.id];
  }
  await writeFile(p, `${JSON.stringify(dungeons, null, 2)}\n`, "utf8");
}

async function patchMonstersJson() {
  const p = path.join(root, "data/monsters.json");
  const monsters = JSON.parse(await readFile(p, "utf8"));
  for (const [id, row] of Object.entries(monsters)) {
    if (MONSTER_NAMES[id]) row.name = MONSTER_NAMES[id];
  }
  await writeFile(p, `${JSON.stringify(monsters, null, 2)}\n`, "utf8");
}

async function patchRaidsJson() {
  const p = path.join(root, "data/raids.json");
  const raids = JSON.parse(await readFile(p, "utf8"));
  for (const r of raids) {
    const bossId = r.encounters?.[0]?.monsterId;
    if (bossId && MONSTER_NAMES[bossId]) r.name = MONSTER_NAMES[bossId];
  }
  await writeFile(p, `${JSON.stringify(raids, null, 2)}\n`, "utf8");
}

async function patchTowerJson() {
  const p = path.join(root, "data/tower.json");
  const tower = JSON.parse(await readFile(p, "utf8"));
  tower.name = "삼계의 탑";
  await writeFile(p, `${JSON.stringify(tower, null, 2)}\n`, "utf8");
}

async function patchCsv(rel, idCol, nameMap) {
  const p = path.join(root, rel);
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idIdx = header.findIndex((h) => h.trim() === idCol || h.trim() === "Id");
  const nameIdx = header.findIndex((h) => h.trim() === "Name");
  if (idIdx < 0 || nameIdx < 0) return;
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const id = cols[idIdx]?.trim();
    if (nameMap[id]) cols[nameIdx] = nameMap[id];
    out.push(cols.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

async function patchGearDropPlanCsv() {
  const p = path.join(root, "data/csv-templates/gear_drop_plan.csv");
  const lines = (await readFile(p, "utf8")).trim().split(/\r?\n/);
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const order = Number(cols[0]);
    if (STAGE_NAMES[order - 1]) cols[1] = STAGE_NAMES[order - 1];
    out.push(cols.join(","));
  }
  await writeFile(p, `${out.join("\n")}\n`, "utf8");
}

await patchDungeonsJson();
await patchMonstersJson();
await patchRaidsJson();
await patchTowerJson();
await patchCsv("data/csv-templates/dungeons.csv", "Id", CSV_DUNGEON_NAMES);
await patchCsv("data/csv-templates/monster.csv", "Id", CSV_MONSTER);
await patchCsv("data/csv-templates/boss.csv", "BossId", CSV_BOSS);
await patchCsv("data/csv-templates/raids.csv", "Id", {
  Raid_Boss_Slime_King: "마염 군주",
  Raid_Boss_Goblin_Chieftain: "군번장",
  Raid_Boss_Wolf_Alpha: "마수왕",
  Raid_Boss_Skeleton_Lord: "낙천 장군",
  Raid_Boss_Flame_Tyrant: "심판의 폭군",
  Raid_Boss_Frost_Titan: "서릿빛 거신",
  Raid_Boss_Elder_Dragon: "차원 고룡",
  Raid_Boss_Void_Harbinger: "이계 사자",
  Raid_Boss_Void_Overlord: "공허 군주",
});
await patchCsv("data/csv-templates/tower.csv", "SeasonKey", { default: "삼계의 탑" });
await patchGearDropPlanCsv();

console.log("patch-realm-theme: ok");
