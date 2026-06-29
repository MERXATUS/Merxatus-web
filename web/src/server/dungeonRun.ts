import { prisma, assertRowsUpdated } from "@/server/db";
import { loadDungeons, type DungeonDef } from "@/server/dungeonData";
import { findDungeonById, isSpecialDungeonDef, type SpecialDungeonDef } from "@/server/specialDungeonData";
import { SPECIAL_DUNGEON_TICKET_ITEM_ID, specialDungeonTicketCost } from "@/shared/specialDungeon";
import { getPotionEffect } from "@/server/potionEffectsData";
import { buildCombatReplay } from "@/server/combatReplay";
import { computeHpRecoveryAmount } from "@/shared/potionEffects";
import {
  buildPartyCombatants,
  buildFullPartyHp,
  partyMemberToCombatantInput,
  type FloorEnemy,
  type PartyHpSnapshot,
} from "@/server/dungeonBattler";
import { resolveFloorCombat } from "@/server/resolveFloorCombat";
import { computeWinRate } from "@/server/dungeonCombat";
import { knightOrderPartyDamageMult } from "@/shared/knightOrder";
import { resolveFloorMonster } from "@/server/dungeonEncounters";
import { combatPowerFromMonster } from "@/server/monsterCombat";
import { invalidateUserCombatMetaCache, loadPartyCombatRows, type PartyCombatDb } from "@/server/minionCombatBuild";
import { grantLootToUser } from "@/server/grantLootToUser";
import { takeAvailableFromStack } from "@/server/inventoryStackOps";
import { grantDungeonRunGold } from "@/server/dungeonGoldEarn";
import { grantDungeonFloorXp, grantMinionsExperience } from "@/server/minionLevelUp";
import { checkDungeonPartyEligibility, dungeonEnemyCombatMults } from "@/shared/dungeonDifficulty";
import {
  assertDungeonStage,
  dungeonAutoWaveXpForStage,
  dungeonIdForStageOrder,
  stageOrderForDungeonId,
} from "@/shared/dungeonStageProgression";
import {
  pushLuckFloorGoldReward,
  pushLuckLootMultiplier,
  scaleLootEntries,
} from "@/shared/dungeonPushLuck";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import {
  parsePartyHpJson,
  partyHpToMap,
  serializePartyHp,
  type PartyHpEntry,
} from "@/shared/dungeonPartyHp";
import { normalizeItemId, normalizeItemIdLower } from "@/shared/itemId";
import { parseRunPartyBuild, serializeRunPartyBuild } from "@/server/dungeonPartyBuildSnapshot";

export type { PartyHpEntry };

type PartyCombatRowsResult = Awaited<ReturnType<typeof loadPartyCombatRows>>;

type PartyCombatCacheValue = {
  partyPower: PartyCombatRowsResult["partyPower"];
  combatants: ReturnType<typeof buildPartyCombatants>;
  memberInputs: PartyCombatRowsResult["memberInputs"];
  knightOrder: PartyCombatRowsResult["knightOrder"];
};

const partyCombatCache = new Map<
  string,
  {
    expiresAt: number;
    value: PartyCombatCacheValue;
  }
>();

const PARTY_COMBAT_CACHE_TTL_MS = 30_000;

const ADVANCE_TIMING_DEBUG =
  process.env.DUNGEON_ADVANCE_TIMING === "1" ||
  process.env.DUNGEON_ADVANCE_TIMING === "true" ||
  process.env.DUNGEON_ADVANCE_TIMING === "yes";

function timeSync<T>(label: string, fn: () => T, ctx?: Record<string, unknown>): T {
  if (!ADVANCE_TIMING_DEBUG) return fn();
  const t0 = Date.now();
  const out = fn();
  const ms = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`[dungeonRun/advanceTiming] ${label} ${ms}ms${ctx ? ` ${JSON.stringify(ctx)}` : ""}`);
  return out;
}

async function timeAsync<T>(label: string, fn: () => Promise<T>, ctx?: Record<string, unknown>): Promise<T> {
  if (!ADVANCE_TIMING_DEBUG) return fn();
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`[dungeonRun/advanceTiming] ${label} ${ms}ms${ctx ? ` ${JSON.stringify(ctx)}` : ""}`);
  return out;
}

export function resolvePartyHpForRun(
  partyHpJson: string | null | undefined,
  combatants: Array<{ id: string; label: string; power: number }>,
): { entries: PartyHpEntry[]; map: Record<string, { hp: number; maxHp: number }> } {
  const parsed = parsePartyHpJson(partyHpJson ?? "[]");
  if (parsed.length > 0) {
    return { entries: parsed, map: partyHpToMap(parsed) };
  }
  const full = buildFullPartyHp(
    combatants.map((c) => ({ id: c.id, label: c.label, power: c.power })),
  );
  return {
    entries: full.map((f) => ({
      minionId: f.minionId,
      hp: f.hp,
      maxHp: f.maxHp,
      label: f.label,
    })),
    map: partyHpToMap(
      full.map((f) => ({ minionId: f.minionId, hp: f.hp, maxHp: f.maxHp, label: f.label })),
    ),
  };
}

export function snapshotsToEntries(rows: PartyHpSnapshot[]): PartyHpEntry[] {
  return rows.map((r) => ({
    minionId: r.minionId,
    hp: r.hp,
    maxHp: r.maxHp,
    label: r.label,
  }));
}


export async function initializeDungeonRunPartyHp(userId: string, runId: string) {
  const run = await prisma.dungeonRun.findUnique({
    where: { id: runId },
    include: { party: { include: { minion: true } } },
  });
  if (!run) return;
  const { combatants } = await loadRunPartyCombat(prisma, userId, run, runId);
  const entries = snapshotsToEntries(buildFullPartyHp(combatants));
  await prisma.dungeonRun.update({
    where: { id: runId },
    data: { partyHpJson: serializePartyHp(entries) },
  });
}

type CreatePushLuckRunResult =
  | { ok: false; error: "MINION_NOT_FOUND" | "PARTY_TOO_LARGE" | string }
  | { ok: true; runId: string; dungeon: DungeonDef };

export async function assertDungeonPartyEligible(
  userId: string,
  dungeon: DungeonDef,
  minionIds: string[],
) {
  let stageDungeonId: string;
  if ("linkedStageOrder" in dungeon && typeof (dungeon as SpecialDungeonDef).linkedStageOrder === "number") {
    const spec = dungeon as SpecialDungeonDef;
    stageDungeonId = dungeonIdForStageOrder(spec.linkedStageOrder) ?? spec.id;
  } else {
    stageDungeonId = dungeon.id;
  }
  const stage = assertDungeonStage(stageDungeonId);
  const minions = await prisma.minion.findMany({
    where: { id: { in: minionIds }, userId },
    select: { id: true, level: true },
  });
  if (minions.length !== minionIds.length) throw new Error("MINION_NOT_FOUND");

  const eligibility = checkDungeonPartyEligibility({
    stage,
    partyLevels: minions.map((m) => m.level),
  });
  if (!eligibility.ok) {
    throw new Error(
      `DUNGEON_PARTY_LEVEL_TOO_LOW:${eligibility.minLevel}:${eligibility.partyLevel}`,
    );
  }
}

/** PUSH_LUCK 던전 런 생성 — 기존 RUNNING 런은 STOP */
export async function createPushLuckDungeonRun(input: {
  userId: string;
  dungeon: DungeonDef;
  minionIds: string[];
}): Promise<CreatePushLuckRunResult> {
  const ids = Array.from(
    new Set(input.minionIds.map((x) => String(x).trim()).filter((x) => x.length > 0)),
  );
  const maxParty = input.dungeon.maxPartySize ?? 1;
  if (ids.length === 0 || ids.length > maxParty) {
    return { ok: false, error: "PARTY_TOO_LARGE" };
  }

  try {
    await assertDungeonPartyEligible(input.userId, input.dungeon, ids);
  } catch (e) {
    const message = e instanceof Error ? e.message : "DUNGEON_PARTY_INELIGIBLE";
    return { ok: false, error: message };
  }

  const run = await prisma.$transaction(async (tx) => {
    await tx.dungeonRun.updateMany({
      where: { userId: input.userId, status: "RUNNING" },
      data: { status: "STOPPED" },
    });

    if (isSpecialDungeonDef(input.dungeon)) {
      const spec = input.dungeon as SpecialDungeonDef;
      const cost = spec.ticketCost ?? specialDungeonTicketCost(spec.linkedStageOrder);
      const ticketId = spec.ticketItemId ?? SPECIAL_DUNGEON_TICKET_ITEM_ID;
      await takeAvailableFromStack(tx, input.userId, ticketId, cost);
    }

    const minions = await tx.minion.findMany({
      where: { id: { in: ids }, userId: input.userId },
      select: { id: true },
      take: 20,
    });
    if (minions.length !== ids.length) {
      return { ok: false as const, error: "MINION_NOT_FOUND" as const };
    }

    const created = await tx.dungeonRun.create({
      data: {
        userId: input.userId,
        dungeonId: input.dungeon.id,
        status: "RUNNING",
        startedAt: new Date(),
        lastTickAt: new Date(),
        party: { create: ids.map((id) => ({ minionId: id })) },
      },
    });
    return { ok: true as const, runId: created.id };
  });

  if (!run.ok) return run;
  return { ok: true, runId: run.runId, dungeon: input.dungeon };
}

/** 활성 런이 없으면 생성 후 1층 전투, 있으면 다음 층 진행 */
export async function advanceOrStartPushLuckFloor(input: {
  userId: string;
  dungeonId?: string;
  minionIds?: string[];
}) {
  let run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });

  if (run?.autoExplore) {
    throw new Error("AUTO_EXPLORE_ACTIVE");
  }

  const { dungeons } = await loadDungeons();

  if (!run) {
    const dungeonId = (input.dungeonId ?? "").trim();
    if (!dungeonId || !input.minionIds?.length) {
      throw new Error("NO_ACTIVE_RUN");
    }
    const dungeon = await findDungeonById(dungeonId);
    if (!dungeon) throw new Error("DUNGEON_NOT_FOUND");
    if (dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

    const created = await createPushLuckDungeonRun({
      userId: input.userId,
      dungeon,
      minionIds: input.minionIds,
    });
    if (!created.ok) throw new Error(created.error);

    run = await prisma.dungeonRun.findFirst({
      where: { userId: input.userId, status: "RUNNING", dungeonId },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

    return advancePushLuckFloor({ userId: input.userId, dungeon: created.dungeon });
  }

  const dungeon = await findDungeonById(run.dungeonId);
  if (!dungeon) throw new Error("DUNGEON_DEF_MISSING");
  if (dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

  return advancePushLuckFloor({ userId: input.userId, dungeon });
}

function randIntInclusive(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function pickWeightedIndex(weights: number[], rnd: () => number) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export async function tickAndMaybeCollectDungeonRun(input: { userId: string; dungeon: DungeonDef; commitLoot: boolean }) {
  if (input.dungeon.mode === "PUSH_LUCK") {
    throw new Error("PUSH_LUCK_USE_ADVANCE_API");
  }
  const now = new Date();

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: "RUNNING", dungeonId: input.dungeon.id },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

  const last = new Date(run.lastTickAt).getTime();
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - last) / 1000));
  const waves = Math.floor(elapsedSec / input.dungeon.baseWaveSeconds);
  if (waves <= 0) {
    return {
      ok: true as const,
      runId: run.id,
      progressedWaves: 0,
      winsAdded: 0,
      lossesAdded: 0,
      winRate: null as number | null,
      loot: [] as Array<{ itemId: string; qty: number }>,
    };
  }

  const { partyPower } = await loadPartyCombatRows(prisma, input.userId, run.party);
  const waveMonster = await resolveFloorMonster(input.dungeon, 1);
  const winRate = computeWinRate({
    partyPower,
    enemyPower: combatPowerFromMonster(waveMonster.monster),
  });

  let winsAdded = 0;
  let lossesAdded = 0;
  const rnd = Math.random;
  for (let i = 0; i < waves; i++) {
    if (rnd() < winRate) winsAdded += 1;
    else lossesAdded += 1;
  }

  const lootMap = new Map<string, number>();
  if (winsAdded > 0) {
    const weights = input.dungeon.drops.map((d) => d.weight);
    for (let i = 0; i < winsAdded; i++) {
      const idx = pickWeightedIndex(weights, rnd);
      if (idx < 0) continue;
      const entry = input.dungeon.drops[idx]!;
      const itemId = normalizeItemIdLower(entry.itemId);
      if (!itemId) continue;
      const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
      lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);
    }
  }

  const advancedSec = waves * input.dungeon.baseWaveSeconds;
  const nextLast = new Date(new Date(run.lastTickAt).getTime() + advancedSec * 1000);

  assertRowsUpdated(
    (
      await prisma.dungeonRun.updateMany({
        where: { id: run.id, status: "RUNNING", lastTickAt: run.lastTickAt },
        data: {
          lastTickAt: nextLast,
          wins: { increment: winsAdded },
          losses: { increment: lossesAdded },
        },
      })
    ).count,
  );

  const partyMinionIds = (run.party ?? []).map((p) => p.minionId);
  const maxFloors = input.dungeon.maxFloors ?? 20;
  const minionXpGrants =
    winsAdded > 0
      ? await grantMinionsExperience(
          prisma,
          partyMinionIds,
          winsAdded * dungeonAutoWaveXpForStage(input.dungeon.id, maxFloors),
        )
      : [];

  if (input.commitLoot) {
    await grantLootToUser(prisma, input.userId, [...lootMap.entries()].map(([itemId, qty]) => ({ itemId, qty })));
  }

  return {
    ok: true as const,
    runId: run.id,
    progressedWaves: waves,
    winsAdded,
    lossesAdded,
    winRate,
    partyPower,
    loot: Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty })),
    minionXpGrants,
  };
}

export type LootEntry = { itemId: string; qty: number };

export type PendingLootDisplayItem = { itemId: string; qty: number; name: string; grade: number };

export function mergeLoot(a: LootEntry[], b: LootEntry[]): LootEntry[] {
  const m = new Map<string, number>();
  const add = (rawId: unknown, rawQty: unknown) => {
    const itemId = normalizeItemIdLower(rawId);
    const qty = Math.max(0, Math.floor(Number(rawQty ?? 0)));
    if (!itemId || qty <= 0) return;
    m.set(itemId, (m.get(itemId) ?? 0) + qty);
  };
  for (const x of a) add(x.itemId, x.qty);
  for (const x of b) add(x.itemId, x.qty);
  return Array.from(m.entries())
    .filter(([, q]) => q > 0)
    .map(([itemId, qty]) => ({ itemId, qty }));
}

export function safeParsePendingLoot(json: unknown): LootEntry[] {
  try {
    const raw = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => ({
        itemId: normalizeItemIdLower(x?.itemId),
        qty: Math.max(0, Math.floor(Number(x?.qty ?? 0))),
      }))
      .filter((x) => x.itemId.length > 0 && x.qty > 0);
  } catch {
    return [];
  }
}

export async function enrichLootEntries(
  db: Pick<import("@prisma/client").PrismaClient, "item">,
  entries: LootEntry[],
): Promise<PendingLootDisplayItem[]> {
  if (!entries.length) return [];
  const items = await db.item.findMany({
    where: { id: { in: entries.map((e) => e.itemId) } },
    select: { id: true, name: true, grade: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return entries.map((e) => ({
    itemId: e.itemId,
    qty: e.qty,
    name: byId.get(e.itemId)?.name ?? e.itemId,
    grade: byId.get(e.itemId)?.grade ?? 1,
  }));
}

export async function resolvePendingLootDisplay(
  db: Pick<import("@prisma/client").PrismaClient, "item">,
  pendingLootJson: unknown,
): Promise<PendingLootDisplayItem[]> {
  return enrichLootEntries(db, safeParsePendingLoot(pendingLootJson));
}

function rollDrops(
  def: { drops: DungeonDef["drops"] },
  rolls: number,
  floor: number,
  rnd = Math.random,
): LootEntry[] {
  const lootMap = new Map<string, number>();
  if (rolls <= 0) return [];
  const f = Math.max(1, Math.floor(floor));
  const pool = def.drops.filter((d) => {
    const minF = d.minFloor ?? 1;
    const maxF = d.maxFloor ?? Number.MAX_SAFE_INTEGER;
    return minF <= f && f <= maxF;
  });
  if (!pool.length) return [];
  const weights = pool.map((d) => d.weight);
  for (let i = 0; i < rolls; i++) {
    const idx = pickWeightedIndex(weights, rnd);
    if (idx < 0) continue;
    const entry = pool[idx]!;
    const itemId = normalizeItemIdLower(entry.itemId);
    if (!itemId) continue;
    const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
    lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);
  }
  return Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));
}

function invalidateRunPartyCombatCache(userId: string, runId: string) {
  partyCombatCache.delete(`partyCombat:${userId}:${runId}`);
}

type RunPartyRow = {
  id: string;
  partyBuildJson?: string | null;
  party: Array<{ minionId: string; minion: { level: number; jobType: string; equippedWeaponInstanceId: string | null } }>;
};

async function computeRunPartyCombat(tx: PartyCombatDb, userId: string, run: RunPartyRow) {
  const party = run.party ?? [];
  if (party.length === 0) throw new Error("DUNGEON_PARTY_EMPTY");
  const { memberInputs, partyPower, knightOrder } = await loadPartyCombatRows(tx, userId, party);
  if (!memberInputs?.length) throw new Error("DUNGEON_PARTY_EMPTY");
  const combatants = buildPartyCombatants(memberInputs.map(partyMemberToCombatantInput));
  return { partyPower, combatants, memberInputs, knightOrder };
}

async function readRunPartyBuildJson(runId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ partyBuildJson: string }>>`
      SELECT "partyBuildJson" FROM "DungeonRun" WHERE "id" = ${runId} LIMIT 1
    `;
    const json = rows[0]?.partyBuildJson;
    return json?.trim() ? json : null;
  } catch {
    return null;
  }
}

async function persistRunPartyBuild(runId: string, value: PartyCombatCacheValue) {
  const json = serializeRunPartyBuild(value);
  if (!json) return;
  try {
    await prisma.$executeRaw`
      UPDATE "DungeonRun" SET "partyBuildJson" = ${json} WHERE "id" = ${runId}
    `;
  } catch {
    /* column not migrated yet — memory cache only */
  }
}

async function refreshRunPartyBuild(
  tx: PartyCombatDb,
  userId: string,
  run: RunPartyRow,
) {
  invalidateRunPartyCombatCache(userId, run.id);
  invalidateUserCombatMetaCache(userId);
  const value = await computeRunPartyCombat(tx, userId, run);
  await persistRunPartyBuild(run.id, value);
  partyCombatCache.set(`partyCombat:${userId}:${run.id}`, {
    expiresAt: Date.now() + PARTY_COMBAT_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function ensureRunPartyRow(run: RunPartyRow): Promise<RunPartyRow> {
  if (run.party?.length) return run;
  const full = await prisma.dungeonRun.findUnique({
    where: { id: run.id },
    include: { party: { include: { minion: true } } },
  });
  if (!full?.party?.length) throw new Error("DUNGEON_PARTY_EMPTY");
  return full;
}

async function loadRunPartyCombat(
  tx: PartyCombatDb,
  userId: string,
  run: RunPartyRow,
  cacheKey?: string,
) {
  const runRow = await ensureRunPartyRow(run);
  const buildJson = runRow.partyBuildJson?.trim()
    ? runRow.partyBuildJson
    : await readRunPartyBuildJson(runRow.id);
  const stored = parseRunPartyBuild(buildJson);
  if (stored?.memberInputs?.length && stored.combatants?.length) {
    return {
      partyPower: stored.partyPower,
      combatants: stored.combatants,
      memberInputs: stored.memberInputs,
      knightOrder: stored.knightOrder,
    };
  }

  const key = cacheKey ? `partyCombat:${userId}:${cacheKey}` : "";
  if (key) {
    const cached = partyCombatCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const value = await computeRunPartyCombat(tx, userId, runRow);
  await persistRunPartyBuild(runRow.id, value);
  if (key) {
    partyCombatCache.set(key, { expiresAt: Date.now() + PARTY_COMBAT_CACHE_TTL_MS, value });
  }
  return value;
}

type ActiveDungeonRunRow = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.dungeonRun.findFirst<{
        include: { party: { include: { minion: true } } };
      }>
    >
  >
>;

export async function getActiveRunCombatPreview(
  userId: string,
  options?: {
    existingRun?: ActiveDungeonRunRow;
    dungeon?: DungeonDef;
  },
) {
  const run =
    options?.existingRun ??
    (await prisma.dungeonRun.findFirst({
      where: { userId, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      include: { party: { include: { minion: true } } },
    }));
  if (!run) return null;

  const dungeon =
    options?.dungeon ??
    (await loadDungeons()).dungeons.find((d) => d.id === run.dungeonId);
  if (!dungeon) return null;

  const floor = Math.max(1, Math.floor(run.floor ?? 1));
  const { partyPower, combatants } = await loadRunPartyCombat(prisma, userId, run, run.id);
  const { entries: partyHp } = resolvePartyHpForRun(run.partyHpJson, combatants);

  return { partyPower, floor, partyHp };
}

export async function advancePushLuckFloor(input: { userId: string; dungeon: DungeonDef }) {
  if (input.dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

  const totalT0 = Date.now();
  const run = await timeAsync(
    "load_run_row",
    () =>
      prisma.dungeonRun.findFirst({
        where: { userId: input.userId, status: "RUNNING", dungeonId: input.dungeon.id },
        include: { party: { include: { minion: true } } },
        orderBy: { startedAt: "desc" },
      }),
    { dungeonId: input.dungeon.id },
  );
  if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

  const floor = Math.max(1, Math.floor(run.floor ?? 1));
  const pending = safeParsePendingLoot(run.pendingLootJson ?? "[]");

  const [{ partyPower, combatants, memberInputs, knightOrder }, floorMonster] = await Promise.all([
    timeAsync(
      "loadRunPartyCombat",
      () => loadRunPartyCombat(prisma, input.userId, run, run.id),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    ),
    timeAsync(
      "resolveFloorMonster",
      () => resolveFloorMonster(input.dungeon, floor),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    ),
  ]);
  const { map: partyHpStart } = resolvePartyHpForRun(run.partyHpJson, combatants);

  const enemy: FloorEnemy = { name: floorMonster.monster.name, monster: floorMonster.monster };
  const isBoss = floorMonster.category === "BOSS";
  const maxFloors = input.dungeon.maxFloors ?? 20;
  const stageOrder = stageOrderForDungeonId(input.dungeon.id) ?? 1;
  const enemyCombatMults = dungeonEnemyCombatMults({ stageOrder, floor, maxFloors, isBoss });
  const partyDamageMult = knightOrderPartyDamageMult(knightOrder, isBoss);
  const combatReplay = timeSync(
    "buildCombatReplay",
    () =>
      buildCombatReplay(
        floor,
        enemy,
        floorMonster.monsterId,
        partyHpStart,
        combatants,
        memberInputs,
        enemyCombatMults,
      ),
    { dungeonId: input.dungeon.id, runId: run.id, floor },
  );
  const battle = timeSync(
    "resolveFloorCombat",
    () =>
      resolveFloorCombat({
        floor,
        maxFloors,
        party: combatants,
        enemy,
        partyHp: partyHpStart,
        partyDamageMult,
        enemyCombatMults,
        enemyTags: { isBoss, isAngel: false, isDemon: false },
        monsterId: floorMonster.monsterId,
      }),
    { dungeonId: input.dungeon.id, runId: run.id, floor },
  );
  const combatLog: CombatLogLine[] = battle.log;
  const partyHpAfter = snapshotsToEntries(battle.partyHp);
  const win = battle.outcome === "WIN";

  if (!win) {
    const forfeitedGold = Math.max(0, Math.floor(run.pendingGold ?? 0));
    assertRowsUpdated(
      await timeAsync(
        "updateMany_loss",
        () =>
          prisma.dungeonRun.updateMany({
            where: { id: run.id, status: "RUNNING", floor },
            data: {
              status: "STOPPED",
              losses: { increment: 1 },
              lastTickAt: new Date(),
              pendingLootJson: "[]",
              pendingGold: 0,
              partyHpJson: serializePartyHp(partyHpAfter),
            },
          }).then((r) => r.count),
        { dungeonId: input.dungeon.id, runId: run.id, floor },
      ),
    );
    const forfeitedLoot = await timeAsync(
      "enrichLootEntries_loss",
      () => enrichLootEntries(prisma, pending),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    );
    return {
      ok: true as const,
      result: "LOSS" as const,
      floor,
      partyPower,
      combatLog,
      combatReplay,
      isBoss,
      partyHp: partyHpAfter,
      lootGained: [] as LootEntry[],
      pendingLoot: [] as LootEntry[],
      forfeitedLoot,
      forfeitedGold,
      pendingGold: 0,
    };
  }

  const lootMult = pushLuckLootMultiplier(floor);
  const rawLoot = rollDrops({ drops: input.dungeon.drops }, 1, floor);
  const rawBoss =
    floor >= (input.dungeon.maxFloors ?? 20)
      ? rollDrops({ drops: input.dungeon.bossDrops ?? [] }, 1, floor)
      : [];
  const gained = scaleLootEntries(mergeLoot(rawLoot, rawBoss), lootMult);
  const nextPending = mergeLoot(pending, gained);
  const nextFloor = Math.min(maxFloors + 1, floor + 1);

  const floorGold = pushLuckFloorGoldReward(floor, stageOrder);
  const nextPendingGold = Math.max(0, Math.floor(run.pendingGold ?? 0)) + floorGold;

  const partyMinionIds = (run.party ?? []).map((p) => p.minionId);
  if (partyMinionIds.length === 0) throw new Error("DUNGEON_PARTY_EMPTY");

  const minionXpGrants = await timeAsync(
    "grantDungeonFloorXp",
    () => grantDungeonFloorXp(prisma, partyMinionIds, input.dungeon.id, floor),
    { dungeonId: input.dungeon.id, runId: run.id, floor },
  );
  if (minionXpGrants.some((g) => g.levelsGained > 0)) {
    await refreshRunPartyBuild(prisma, input.userId, run);
  }

  const finished = floor >= (input.dungeon.maxFloors ?? 20);
  if (finished) {
    assertRowsUpdated(
      await timeAsync(
        "updateMany_win_finished",
        () =>
          prisma.dungeonRun
            .updateMany({
              where: { id: run.id, status: "RUNNING", floor },
              data: {
                wins: { increment: 1 },
                lastTickAt: new Date(),
                floor: nextFloor,
                partyHpJson: serializePartyHp(partyHpAfter),
                status: "STOPPED",
                pendingLootJson: "[]",
                pendingGold: 0,
              },
            })
            .then((r) => r.count),
        { dungeonId: input.dungeon.id, runId: run.id, floor },
      ),
    );
    await timeAsync(
      "grantLootToUser_finished",
      () => grantLootToUser(prisma, input.userId, nextPending),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    );
    if (nextPendingGold > 0) {
      await timeAsync(
        "grantDungeonRunGold_finished",
        () =>
          grantDungeonRunGold(prisma, {
            userId: input.userId,
            dungeonId: input.dungeon.id,
            amount: nextPendingGold,
          }),
        { dungeonId: input.dungeon.id, runId: run.id, floor },
      );
    }
    const cashedOutDisplay = await timeAsync(
      "enrichLootEntries_finished",
      () => enrichLootEntries(prisma, nextPending),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    );
    if (ADVANCE_TIMING_DEBUG) {
      // eslint-disable-next-line no-console
      console.log(
        `[dungeonRun/advanceTiming] total ${Date.now() - totalT0}ms ${JSON.stringify({
          dungeonId: input.dungeon.id,
          runId: run.id,
          floor,
          result: "WIN_FINISHED",
        })}`,
      );
    }
    return {
      ok: true as const,
      result: "WIN_AND_CASHOUT" as const,
      floor,
      partyPower,
      combatLog,
      combatReplay,
      isBoss,
      partyHp: partyHpAfter,
      lootGained: gained,
      pendingLoot: [] as LootEntry[],
      cashedOut: cashedOutDisplay,
      goldGained: nextPendingGold,
      lootMultiplier: lootMult,
      minionXpGrants,
      pendingGold: 0,
    };
  }

  assertRowsUpdated(
    await timeAsync(
      "updateMany_win_continue",
      () =>
        prisma.dungeonRun
          .updateMany({
            where: { id: run.id, status: "RUNNING", floor },
            data: {
              wins: { increment: 1 },
              lastTickAt: new Date(),
              floor: nextFloor,
              pendingLootJson: JSON.stringify(nextPending),
              pendingGold: nextPendingGold,
              partyHpJson: serializePartyHp(partyHpAfter),
            },
          })
          .then((r) => r.count),
      { dungeonId: input.dungeon.id, runId: run.id, floor },
    ),
  );

  if (ADVANCE_TIMING_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[dungeonRun/advanceTiming] total ${Date.now() - totalT0}ms ${JSON.stringify({
        dungeonId: input.dungeon.id,
        runId: run.id,
        floor,
        result: "WIN",
      })}`,
    );
  }

  return {
    ok: true as const,
    result: "WIN" as const,
    floor,
    partyPower,
    combatLog,
    combatReplay,
    isBoss,
    partyHp: partyHpAfter,
    lootGained: gained,
    pendingLoot: nextPending,
    goldGained: floorGold,
    pendingGold: nextPendingGold,
    lootMultiplier: lootMult,
    minionXpGrants,
  };
}

export async function cashoutPushLuckRun(input: { userId: string; dungeon: DungeonDef }) {
  if (input.dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: "RUNNING", dungeonId: input.dungeon.id },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

  const pending = safeParsePendingLoot(run.pendingLootJson ?? "[]");
  const pendingGold = Math.max(0, Math.floor(run.pendingGold ?? 0));
  assertRowsUpdated(
    await prisma.dungeonRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: { status: "STOPPED", pendingLootJson: "[]", pendingGold: 0 },
    }).then((r) => r.count),
  );
  await grantLootToUser(prisma, input.userId, pending);
  if (pendingGold > 0) {
    await grantDungeonRunGold(prisma, {
      userId: input.userId,
      dungeonId: input.dungeon.id,
      amount: pendingGold,
    });
  }
  const cashedOut = await enrichLootEntries(prisma, pending);
  return { ok: true as const, cashedOut, goldGained: pendingGold };
}

/** PUSH_LUCK 층간 — 인벤 물약 1개 소모, 파티원 HP 회복 */
export async function usePotionOnActiveRun(input: {
  userId: string;
  itemId: string;
  minionId: string;
}) {
  const itemId = normalizeItemId(input.itemId);
  const minionId = input.minionId.trim();
  if (!itemId || !minionId) throw new Error("BAD_REQUEST");

  const effect = await getPotionEffect(itemId);
  if (!effect || effect.effectType !== "HP_Recovery") throw new Error("INVALID_POTION");

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: input.userId, status: "RUNNING" },
    include: { party: { include: { minion: true } } },
    orderBy: { startedAt: "desc" },
  });
  if (!run) throw new Error("NO_ACTIVE_RUN");

  const { dungeons } = await loadDungeons();
  const dungeon = dungeons.find((d) => d.id === run.dungeonId);
  if (!dungeon || dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");

  if (!run.party.some((p) => p.minionId === minionId)) throw new Error("MINION_NOT_IN_PARTY");

  const stack = await prisma.inventoryStack.findUnique({
    where: { userId_itemId: { userId: input.userId, itemId } },
  });
  const potionAvailable = stack ? stack.quantity - Math.max(0, stack.lockedQuantity) : 0;
  if (potionAvailable < 1) throw new Error(stack && (stack.quantity ?? 0) >= 1 ? "ITEM_LOCKED" : "NO_POTION");

  const { combatants } = await loadRunPartyCombat(prisma, input.userId, run);
  const { entries } = resolvePartyHpForRun(run.partyHpJson, combatants);
  const idx = entries.findIndex((e) => e.minionId === minionId);
  if (idx < 0) throw new Error("MINION_NOT_IN_PARTY");

  const target = entries[idx]!;
  if (target.hp <= 0) throw new Error("MINION_DEAD");
  if (target.hp >= target.maxHp) throw new Error("MINION_FULL_HP");

  const healAmount = computeHpRecoveryAmount(target.maxHp, effect.effectValue);
  const afterHp = Math.min(target.maxHp, target.hp + healAmount);
  const healedAmount = afterHp - target.hp;
  if (healedAmount <= 0) throw new Error("MINION_FULL_HP");

  entries[idx] = { ...target, hp: afterHp };

  await prisma.$transaction(async (tx) => {
    await takeAvailableFromStack(tx, input.userId, itemId, 1);
    assertRowsUpdated(
      await tx.dungeonRun
        .updateMany({
          where: { id: run.id, status: "RUNNING" },
          data: { partyHpJson: serializePartyHp(entries) },
        })
        .then((r) => r.count),
    );
  });

  return {
    ok: true as const,
    itemId,
    minionId,
    healedAmount,
    partyHp: entries,
  };
}

