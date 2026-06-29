/**
 * 전투 밸런스 몬테카를로 시뮬레이션 (실제 `simulateFloorCombat` 엔진 사용)
 *
 *   npx tsx scripts/combat-balance-sim.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPartyCombatants,
  buildFullPartyHp,
  estimateFloorWinChance,
  simulateFloorCombat,
  type CombatantInput,
} from "../src/server/dungeonBattler";
import { computePartyPower } from "../src/server/dungeonCombat";
import { pickEncounterForFloor } from "../src/server/dungeonEncounters";
import type { MonsterDef } from "../src/server/monsterData";
import { combatPowerFromMonster } from "../src/server/monsterCombat";
import {
  ACTIVE_DUNGEON_STAGES,
  stageOrderForDungeonId,
} from "../src/shared/dungeonStageProgression";
import {
  dungeonDifficultyMetaForStage,
  dungeonEnemyCombatMults,
} from "../src/shared/dungeonDifficulty";
import {
  minimumPartyPowerForRaid,
  recommendedPartyPowerForRaid,
} from "../src/shared/raidDifficulty";
import { raidEnemyStatMult } from "../src/shared/combatBalance";
import { raidModeStatMult } from "../src/shared/raidRoster";
import {
  combatMemberFromMinion,
  computeMinionCombatPower,
  type MinionCombatInput,
} from "../src/shared/minionCombatStats";
import type { MinionCombatClass } from "../src/shared/minionDerivedClass";

const ROOT = process.cwd();
const SAMPLES = 120;
const SEED = 42_069;

type DungeonJson = {
  id: string;
  name?: string;
  maxFloors?: number;
  encounters: Array<{ monsterId: string; category: string; fromFloor: number; toFloor: number }>;
};

type RaidJson = {
  id: string;
  name: string;
  difficulty: "normal" | "hard";
  faction: "demon" | "angel";
  maxPhases: number;
  encounters: Array<{ monsterId: string; category: string; phase: number }>;
};

type BuildDef = {
  label: string;
  partySize: number;
  minion: MinionCombatInput;
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(n: number, d = 1) {
  return `${(n * 100).toFixed(d)}%`;
}

function bar(rate: number) {
  const n = Math.max(0, Math.min(20, Math.round(rate * 20)));
  return "█".repeat(n) + "░".repeat(20 - n);
}

function armorSet(ids: Partial<Record<"helmet" | "armor" | "pants" | "shoes", string>>, enhance = 0) {
  const out: MinionCombatInput["armor"] = {};
  for (const slot of ["helmet", "armor", "pants", "shoes"] as const) {
    const id = ids[slot];
    if (id) out[slot] = { itemId: id, enhanceLevel: enhance };
  }
  return out;
}

function fighter(
  level: number,
  weapon?: { id: string; enhance?: number },
  armor?: MinionCombatInput["armor"],
  combatClass: MinionCombatClass = "FIGHTER",
): MinionCombatInput {
  return {
    level,
    fighterRank: level >= 100 ? 2 : level >= 40 ? 1 : 0,
    combatClass,
    baseStats: {
      strength: 8 + Math.floor(level * 0.15),
      agility: 6 + Math.floor(level * 0.1),
      intelligence: 4,
      endurance: 7 + Math.floor(level * 0.12),
    },
    weapon: weapon ? { baseItemId: weapon.id, enhanceLevel: weapon.enhance ?? 0 } : null,
    armor: armor ?? undefined,
  };
}

const BUILDS: BuildDef[] = [
  { label: "신규 Lv5×3 무기없음", partySize: 3, minion: fighter(5) },
  { label: "초반 Lv15×3 돌검+0", partySize: 3, minion: fighter(15, { id: "weapon_stone_sword" }) },
  { label: "초반 Lv25×3 돌검+3", partySize: 3, minion: fighter(25, { id: "weapon_stone_sword", enhance: 3 }) },
  {
    label: "중반 Lv50×3 적금검+5",
    partySize: 3,
    minion: fighter(50, { id: "weapon_red_gold_sword", enhance: 5 }, armorSet({ armor: "armor_chain_armor", helmet: "armor_chain_helmet" }, 3)),
  },
  {
    label: "중반 Lv70×3 강철검+7",
    partySize: 3,
    minion: fighter(70, { id: "weapon_steel_sword", enhance: 7 }, armorSet({ armor: "armor_chain_armor", helmet: "armor_chain_helmet", pants: "armor_chain_pants", shoes: "armor_chain_boots" }, 5)),
  },
  {
    label: "후반 Lv120×3 금검+10",
    partySize: 3,
    minion: fighter(120, { id: "weapon_gold_sword", enhance: 10 }, armorSet({ armor: "armor_diamond_armor", helmet: "armor_diamond_helmet", pants: "armor_diamond_pants", shoes: "armor_diamond_boots" }, 8)),
  },
  {
    label: "말기 Lv180×3 금검+15",
    partySize: 3,
    minion: fighter(180, { id: "weapon_gold_sword", enhance: 15 }, armorSet({ armor: "armor_diamond_armor", helmet: "armor_diamond_helmet", pants: "armor_diamond_pants", shoes: "armor_diamond_boots" }, 12)),
  },
];

function partyFromBuild(build: BuildDef): { party: CombatantInput[]; partyPower: number } {
  const cm = combatMemberFromMinion(build.minion);
  const perPower = computePartyPower({ members: [cm.member] });
  const members = Array.from({ length: build.partySize }, (_, i) => ({
    minionId: `m${i}`,
    combatClassLabel: build.minion.combatClass ?? "FIGHTER",
    power: perPower,
    bonusHp: cm.bonusHp,
    bonusDef: cm.bonusDef,
    skillDamageMult: cm.skillDamageMult,
  }));
  const party = buildPartyCombatants(members);
  return { party, partyPower: perPower * build.partySize };
}

function monteCarloWinRate(input: {
  party: CombatantInput[];
  floor: number;
  maxFloors: number;
  monster: MonsterDef;
  isBoss: boolean;
  stageOrder: number;
  enemyStatMult?: number;
  rnd: () => number;
}): number {
  let wins = 0;
  const enemyCombatMults = input.enemyStatMult
    ? undefined
    : dungeonEnemyCombatMults({
        stageOrder: input.stageOrder,
        floor: input.floor,
        maxFloors: input.maxFloors,
        isBoss: input.isBoss,
      });
  for (let i = 0; i < SAMPLES; i++) {
    const battle = simulateFloorCombat({
      floor: input.floor,
      maxFloors: input.maxFloors,
      party: input.party,
      enemy: { name: input.monster.name ?? input.monster.id ?? "enemy", monster: input.monster },
      partyHp: Object.fromEntries(
        buildFullPartyHp(input.party).map((e) => [e.minionId, { hp: e.maxHp, maxHp: e.maxHp }]),
      ),
      rnd: input.rnd,
      enemyStatMult: input.enemyStatMult,
      enemyCombatMults,
      enemyTags: { isBoss: input.isBoss, isAngel: false, isDemon: false },
    });
    if (battle.outcome === "WIN") wins++;
  }
  return wins / SAMPLES;
}

function simulateDungeonFullClear(input: {
  party: CombatantInput[];
  dungeon: DungeonJson;
  stageOrder: number;
  rnd: () => number;
}): number {
  const maxFloors = input.dungeon.maxFloors ?? 20;
  let partyHp = Object.fromEntries(
    buildFullPartyHp(input.party).map((e) => [e.minionId, { hp: e.maxHp, maxHp: e.maxHp }]),
  );
  for (let floor = 1; floor <= maxFloors; floor++) {
    const enc = pickEncounterForFloor(input.dungeon, floor);
    if (!enc) return 0;
    const monster = monsters[enc.monsterId.trim().toLowerCase()];
    if (!monster) return 0;
    const isBoss = String(enc.category).toUpperCase() === "BOSS" || floor >= maxFloors;
    const battle = simulateFloorCombat({
      floor,
      maxFloors,
      party: input.party,
      enemy: { name: monster.name ?? enc.monsterId, monster },
      partyHp,
      rnd: input.rnd,
      enemyCombatMults: dungeonEnemyCombatMults({ stageOrder: input.stageOrder, floor, maxFloors, isBoss }),
      enemyTags: { isBoss, isAngel: false, isDemon: false },
    });
    if (battle.outcome !== "WIN") return 0;
    partyHp = Object.fromEntries(battle.partyHp.map((e) => [e.minionId, { hp: e.hp, maxHp: e.maxHp }]));
    if (battle.partyHp.every((e) => e.hp <= 0)) return 0;
  }
  return 1;
}

function flagWinRate(rate: number, context: "recommended" | "minimum" | "neutral"): string | null {
  if (context === "recommended") {
    if (rate < 0.35) return "⚠ 권장 전투력인데 승률 낮음 (과어려움)";
    if (rate > 0.92) return "⚠ 권장 전투력인데 승률 과다 (과쉬움)";
  }
  if (context === "minimum") {
    if (rate < 0.08) return "⚠ 최소 전투력 진입 불가 수준";
    if (rate > 0.85) return "⚠ 최소 전투력인데 너무 쉬움";
  }
  if (rate <= 0.02) return "⚠ 사실상 0% 승률";
  if (rate >= 0.98) return "⚠ 사실상 100% 승률";
  return null;
}

let monsters: Record<string, MonsterDef> = {};
let dungeons: DungeonJson[] = [];
let raids: RaidJson[] = [];

async function loadData() {
  const dataDir = path.join(ROOT, "data");
  monsters = JSON.parse(await readFile(path.join(dataDir, "monsters.json"), "utf8"));
  dungeons = JSON.parse(await readFile(path.join(dataDir, "dungeons.json"), "utf8"));
  raids = JSON.parse(await readFile(path.join(dataDir, "raids.json"), "utf8"));
}

function stageBuildIndex(stageOrder: number): number {
  if (stageOrder <= 1) return 1;
  if (stageOrder <= 2) return 2;
  if (stageOrder <= 3) return 3;
  if (stageOrder <= 5) return 4;
  if (stageOrder <= 6) return 5;
  if (stageOrder <= 7) return 6;
  return 6;
}

async function main() {
  await loadData();
  const rnd = mulberry32(SEED);
  const issues: string[] = [];

  console.log("=".repeat(72));
  console.log("전투 밸런스 몬테카를로 시뮬 (simulateFloorCombat, n=" + SAMPLES + ")");
  console.log("=".repeat(72));

  console.log("\n## 1. 빌드별 파티 전투력\n");
  console.log("| 빌드 | 1인 전투력 | 파티 합산 |");
  console.log("|------|-----------|----------|");
  const buildStats = BUILDS.map((b) => {
    const { partyPower, party } = partyFromBuild(b);
    const per = Math.floor(partyPower / b.partySize);
    console.log(`| ${b.label} | ${per} | ${partyPower} |`);
    return { build: b, party, partyPower, perMinion: per };
  });

  console.log("\n## 2. 던전 층별 승률 (스테이지 적합 빌드, F1/F10/F20)\n");
  for (const stage of ACTIVE_DUNGEON_STAGES) {
    const dungeon = dungeons.find((d) => d.id === stage.dungeonIds[0]);
    if (!dungeon) continue;
    const bi = stageBuildIndex(stage.stageOrder);
    const { party, partyPower } = buildStats[bi]!;
    const meta = dungeonDifficultyMetaForStage(stage);
    const maxFloors = dungeon.maxFloors ?? 20;
    console.log(`\n### S${stage.stageOrder} ${stage.name} (${dungeon.id}) — 빌드: ${BUILDS[bi]!.label}`);
    console.log(`권장 파티 전투력(참고): ${meta.recommendedPartyPower} · 실제 빌드: ${partyPower}`);
    console.log("| 층 | 적 | 보스 | 승률 | 그래프 | 이슈 |");
    console.log("|----|-----|------|------|--------|------|");
    for (const floor of [1, 10, maxFloors]) {
      const enc = pickEncounterForFloor(dungeon, floor);
      if (!enc) continue;
      const monster = monsters[enc.monsterId.trim().toLowerCase()];
      if (!monster) continue;
      const isBoss = floor >= maxFloors;
      const wr = monteCarloWinRate({
        party,
        floor,
        maxFloors,
        monster,
        isBoss,
        stageOrder: stage.stageOrder,
        rnd,
      });
      const issue = flagWinRate(wr, floor === maxFloors ? "recommended" : "neutral");
      if (issue) issues.push(`${dungeon.id} F${floor}: ${issue} (${pct(wr)})`);
      console.log(
        `| ${floor} | ${enc.monsterId} | ${isBoss ? "Y" : "N"} | ${pct(wr)} | ${bar(wr)} | ${issue ?? "—"} |`,
      );
    }
  }

  console.log("\n## 3. 던전 20층 풀클리어 확률 (HP 이월, 1회 시도×" + SAMPLES + ")\n");
  console.log("| 던전 | 스테이지 | 빌드 | 풀클리어% |");
  console.log("|------|---------|------|----------|");
  for (const stage of ACTIVE_DUNGEON_STAGES) {
    const dungeon = dungeons.find((d) => d.id === stage.dungeonIds[0]);
    if (!dungeon) continue;
    const bi = stageBuildIndex(stage.stageOrder);
    const { party } = buildStats[bi]!;
    let clears = 0;
    for (let i = 0; i < SAMPLES; i++) {
      clears += simulateDungeonFullClear({
        party,
        dungeon,
        stageOrder: stage.stageOrder,
        rnd,
      });
    }
    const rate = clears / SAMPLES;
    const issue =
      rate < 0.05
        ? "⚠ 스테이지 빌드로 풀클 거의 불가"
        : rate > 0.85
          ? "⚠ 스테이지 빌드로 풀클 너무 쉬움"
          : null;
    if (issue) issues.push(`${dungeon.id} full clear: ${issue} (${pct(rate)})`);
    console.log(`| ${dungeon.id} | S${stage.stageOrder} | ${BUILDS[bi]!.label} | ${pct(rate)} |`);
  }

  console.log("\n## 4. 레이드 보스 승률 (3인 파티, 노말/하드)\n");
  const raidSamples = raids.filter((r) => r.encounters[0]);
  console.log("| 레이드 | 적 power | 권장 | 최소 | 빌드 | 승률 | 이슈 |");
  console.log("|--------|---------|------|------|------|------|------|");
  for (const raid of raidSamples) {
    const enc = raid.encounters[0]!;
    const monster = monsters[enc.monsterId.trim().toLowerCase()];
    if (!monster) continue;
    const ep = combatPowerFromMonster(monster);
    const statMult = raidEnemyStatMult(true, ep) * raidModeStatMult(raid.difficulty);
    const recommended = recommendedPartyPowerForRaid(
      Math.floor(ep * raidModeStatMult(raid.difficulty)),
      true,
      3,
    );
    const minimum = minimumPartyPowerForRaid(recommended);
    const tier = raid.difficulty === "hard" ? 6 : 4;
    const bi = Math.min(buildStats.length - 1, Math.max(0, tier - 1));
    const buildsToTest = [
      { label: `최소(${minimum})`, power: minimum, synthetic: true },
      { label: `권장(${recommended})`, power: recommended, synthetic: true },
      { label: BUILDS[bi]!.label, power: buildStats[bi]!.partyPower, synthetic: false },
    ];
    for (const bt of buildsToTest) {
      let party: CombatantInput[];
      if (bt.synthetic) {
        const per = Math.max(1, Math.floor(bt.power / 3));
        party = buildPartyCombatants(
          Array.from({ length: 3 }, (_, i) => ({
            minionId: `s${i}`,
            combatClassLabel: "FIGHTER",
            power: per,
          })),
        );
      } else {
        party = buildStats[bi]!.party;
      }
      let wins = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const battle = simulateFloorCombat({
          floor: 1,
          maxFloors: 1,
          party,
          enemy: { name: raid.name, monster },
          rnd,
          enemyStatMult: statMult,
          enemyTags: { isBoss: true, isAngel: raid.faction === "angel", isDemon: raid.faction === "demon" },
        });
        if (battle.outcome === "WIN") wins++;
      }
      const wr = wins / SAMPLES;
      const ctx = bt.synthetic
        ? bt.label.startsWith("최소")
          ? "minimum"
          : "recommended"
        : "neutral";
      const issue = flagWinRate(wr, ctx as "recommended" | "minimum" | "neutral");
      if (issue) issues.push(`${raid.id} [${bt.label}]: ${issue} (${pct(wr)})`);
      if (bt.synthetic || raid.id.includes("lucifer") || raid.id.includes("michael") || raid.id.includes("asmodeus") || raid.id.includes("sariel")) {
        console.log(
          `| ${raid.name} ${raid.difficulty} | ${ep} | ${recommended} | ${minimum} | ${bt.label} | ${pct(wr)} | ${issue ?? "—"} |`,
        );
      }
    }
  }

  console.log("\n## 5. 권장 전투력 공식 vs 턴 시뮬 일치도 (레이드 보스)\n");
  const probeRaids = raidSamples.filter((r) => /lucifer|michael|asmodeus|sariel/.test(r.id));
  console.log("| 레이드 | 권장파워 | estimateFloorWinChance | simulate MC | 차이 |");
  console.log("|--------|---------|------------------------|-------------|------|");
  for (const raid of probeRaids) {
    const enc = raid.encounters[0]!;
    const monster = monsters[enc.monsterId.trim().toLowerCase()]!;
    const ep = combatPowerFromMonster(monster);
    const statMult = raidEnemyStatMult(true, ep) * raidModeStatMult(raid.difficulty);
    const recommended = recommendedPartyPowerForRaid(Math.floor(ep * raidModeStatMult(raid.difficulty)), true, 3);
    const per = Math.ceil(recommended / 3);
    const party = buildPartyCombatants(
      Array.from({ length: 3 }, (_, i) => ({
        minionId: `r${i}`,
        combatClassLabel: "FIGHTER",
        power: per,
      })),
    );
    const estimated = estimateFloorWinChance({
      floor: 1,
      maxFloors: 1,
      party,
      enemy: { name: raid.name, monster },
      samples: SAMPLES,
      enemyStatMult: statMult,
      enemyTags: { isBoss: true, isAngel: raid.faction === "angel", isDemon: raid.faction === "demon" },
    });
    let wins = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const b = simulateFloorCombat({
        floor: 1,
        maxFloors: 1,
        party,
        enemy: { name: raid.name, monster },
        rnd,
        enemyStatMult: statMult,
        enemyTags: { isBoss: true, isAngel: raid.faction === "angel", isDemon: raid.faction === "demon" },
      });
      if (b.outcome === "WIN") wins++;
    }
    const mc = wins / SAMPLES;
    const diff = Math.abs(estimated - mc);
    console.log(
      `| ${raid.id} | ${recommended} | ${pct(estimated)} | ${pct(mc)} | ${pct(diff, 1)} |`,
    );
    if (diff > 0.2) issues.push(`${raid.id}: estimate vs MC 차이 ${pct(diff)} (공식 불일치)`);
  }

  console.log("\n## 6. 종합 진단\n");
  if (issues.length === 0) {
    console.log("✅ 자동 탐지 기준 이상 징후 없음 (권장/최소 전투력 구간 승률이 대체로 합리적)");
  } else {
    console.log(`⚠ ${issues.length}건 이슈 탐지:\n`);
    for (const s of issues) console.log(`- ${s}`);
  }

  console.log("\n## 7. 참고 — 밸런스 판단 기준\n");
  console.log("- 레이드 **권장** 전투력: 승률 35~92% 구간이 이상적");
  console.log("- 레이드 **최소**(권장×0.85): 승률 8~85% — 도전 가능하되 과도한 무패 방지");
  console.log("- 던전 스테이지 빌드 F20: 최소 40% 이상 권장 (보스 벽)");
  console.log("- 풀클리어: 스테이지 적합 빌드 5~70% — 너무 높거나 낮으면 층 난이도 곡선 조정 필요");
  console.log("\n" + "=".repeat(72));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
