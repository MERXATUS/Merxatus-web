import { prisma } from "@/server/db";
import type { DungeonDef } from "@/server/dungeonData";
import { computePartyPower, computeWinRate } from "@/server/dungeonCombat";
import { weaponCombatBonusFromOptions } from "@/server/itemOptions";

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

  return prisma.$transaction(async (tx) => {
    const run = await tx.dungeonRun.findFirst({
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

    const minionIds = run.party.map((p) => p.minionId);
    const traits = await tx.minionTrait.findMany({
      where: { minionId: { in: minionIds }, type: "FIGHTER" },
      select: { minionId: true, rank: true },
      take: 50,
    });
    const fighterByMinionId = new Map(traits.map((t) => [t.minionId, t.rank]));

    const weaponInstanceIds = run.party
      .map((p) => p.minion.equippedWeaponInstanceId)
      .filter(Boolean) as string[];
    const weapons = weaponInstanceIds.length
      ? await tx.weaponInstance.findMany({
          where: { id: { in: weaponInstanceIds }, userId: input.userId },
          include: { baseItem: true },
          take: 50,
        })
      : [];
    const weaponById = new Map(weapons.map((w) => [w.id, w]));

    const partyPower = computePartyPower({
      members: run.party.map((m) => {
        const wi = weaponById.get(m.minion.equippedWeaponInstanceId ?? "");
        return {
          weaponBaseItemId: wi?.baseItemId ?? null,
          weaponEnhanceLevel: wi?.enhanceLevel ?? 0,
          weaponOptionBonus: wi ? weaponCombatBonusFromOptions(wi.optionsJson) : 0,
          level: m.minion.level,
          fighterRank: fighterByMinionId.get(m.minionId) ?? 0,
          minionGrade: m.minion.grade,
        };
      }),
    });
    const winRate = computeWinRate({ partyPower, dungeon: input.dungeon });

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
        const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
        lootMap.set(entry.itemId, (lootMap.get(entry.itemId) ?? 0) + qty);
      }
    }

    // advance lastTickAt by whole waves only
    const advancedSec = waves * input.dungeon.baseWaveSeconds;
    const nextLast = new Date(new Date(run.lastTickAt).getTime() + advancedSec * 1000);

    await tx.dungeonRun.update({
      where: { id: run.id },
      data: {
        lastTickAt: nextLast,
        wins: { increment: winsAdded },
        losses: { increment: lossesAdded },
      },
    });

    if (input.commitLoot) {
      for (const [itemId, qty] of lootMap.entries()) {
        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (item?.category === "무기") {
          for (let i = 0; i < qty; i++) {
            await tx.weaponInstance.create({
              data: { userId: input.userId, baseItemId: itemId, enhanceLevel: 0, optionsJson: "[]" },
            });
          }
          continue;
        }
        await tx.inventoryStack.upsert({
          where: { userId_itemId: { userId: input.userId, itemId } },
          create: { userId: input.userId, itemId, quantity: qty },
          update: { quantity: { increment: qty } },
        });
      }
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
    };
  });
}

type LootEntry = { itemId: string; qty: number };

function mergeLoot(a: LootEntry[], b: LootEntry[]): LootEntry[] {
  const m = new Map<string, number>();
  for (const x of a) m.set(x.itemId, (m.get(x.itemId) ?? 0) + Math.max(0, Math.floor(x.qty ?? 0)));
  for (const x of b) m.set(x.itemId, (m.get(x.itemId) ?? 0) + Math.max(0, Math.floor(x.qty ?? 0)));
  return Array.from(m.entries())
    .filter(([, q]) => q > 0)
    .map(([itemId, qty]) => ({ itemId, qty }));
}

function safeParsePendingLoot(json: unknown): LootEntry[] {
  try {
    const raw = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => ({
        itemId: typeof x?.itemId === "string" ? x.itemId : "",
        qty: Math.max(0, Math.floor(Number(x?.qty ?? 0))),
      }))
      .filter((x) => x.itemId.length > 0 && x.qty > 0);
  } catch {
    return [];
  }
}

function rollDrops(def: { drops: DungeonDef["drops"] }, rolls: number, rnd = Math.random): LootEntry[] {
  const lootMap = new Map<string, number>();
  if (rolls <= 0) return [];
  const weights = def.drops.map((d) => d.weight);
  for (let i = 0; i < rolls; i++) {
    const idx = pickWeightedIndex(weights, rnd);
    if (idx < 0) continue;
    const entry = def.drops[idx]!;
    const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
    lootMap.set(entry.itemId, (lootMap.get(entry.itemId) ?? 0) + qty);
  }
  return Array.from(lootMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));
}

export async function advancePushLuckFloor(input: { userId: string; dungeon: DungeonDef }) {
  if (input.dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");
  return prisma.$transaction(async (tx) => {
    const run = await tx.dungeonRun.findFirst({
      where: { userId: input.userId, status: "RUNNING", dungeonId: input.dungeon.id },
      include: { party: { include: { minion: true } } },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");

    const extra = (await (tx as any).$queryRawUnsafe(
      `SELECT "floor" as floor, "pendingLootJson" as pendingLootJson FROM "DungeonRun" WHERE "id" = ? LIMIT 1`,
      run.id,
    )) as any;
    const e0 = Array.isArray(extra) ? extra[0] : extra;
    const floor = Math.max(1, Math.floor(e0?.floor ?? 1));
    const pending = safeParsePendingLoot(e0?.pendingLootJson ?? "[]");

    const minionIds = run.party.map((p) => p.minionId);
    const traits = await tx.minionTrait.findMany({
      where: { minionId: { in: minionIds }, type: "FIGHTER" },
      select: { minionId: true, rank: true },
      take: 50,
    });
    const fighterByMinionId = new Map(traits.map((t) => [t.minionId, t.rank]));

    const weaponInstanceIds = run.party
      .map((p) => p.minion.equippedWeaponInstanceId)
      .filter(Boolean) as string[];
    const weapons = weaponInstanceIds.length
      ? await tx.weaponInstance.findMany({
          where: { id: { in: weaponInstanceIds }, userId: input.userId },
          include: { baseItem: true },
          take: 50,
        })
      : [];
    const weaponById = new Map(weapons.map((w) => [w.id, w]));

    const partyPower = computePartyPower({
      members: run.party.map((m) => {
        const wi = weaponById.get(m.minion.equippedWeaponInstanceId ?? "");
        return {
          weaponBaseItemId: wi?.baseItemId ?? null,
          weaponEnhanceLevel: wi?.enhanceLevel ?? 0,
          weaponOptionBonus: wi ? weaponCombatBonusFromOptions(wi.optionsJson) : 0,
          level: m.minion.level,
          fighterRank: fighterByMinionId.get(m.minionId) ?? 0,
          minionGrade: m.minion.grade,
        };
      }),
    });

    const floorPower = Math.max(
      1,
      Math.floor(input.dungeon.power * Math.pow(input.dungeon.floorPowerGrowth ?? 1.12, Math.max(0, floor - 1))),
    );
    const winRate = computeWinRate({ partyPower, dungeon: { ...input.dungeon, power: floorPower } });

    const win = Math.random() < winRate;
    if (!win) {
      await tx.dungeonRun.update({
        where: { id: run.id },
        data: {
          status: "STOPPED",
          losses: { increment: 1 },
          lastTickAt: new Date(),
        },
      });
      await (tx as any).$executeRawUnsafe(`UPDATE "DungeonRun" SET "pendingLootJson" = '[]' WHERE "id" = ?`, run.id);
      return {
        ok: true as const,
        result: "LOSS" as const,
        floor,
        partyPower,
        winRate,
        lootGained: [] as LootEntry[],
        pendingLoot: [] as LootEntry[],
      };
    }

    const loot = rollDrops({ drops: input.dungeon.drops }, 1);
    const bossLoot =
      floor >= (input.dungeon.maxFloors ?? 20) ? rollDrops({ drops: input.dungeon.bossDrops ?? [] }, 1) : [];
    const gained = mergeLoot(loot, bossLoot);
    const nextPending = mergeLoot(pending, gained);
    const nextFloor = Math.min((input.dungeon.maxFloors ?? 20) + 1, floor + 1);

    await tx.dungeonRun.update({
      where: { id: run.id },
      data: {
        wins: { increment: 1 },
        lastTickAt: new Date(),
      },
    });
    await (tx as any).$executeRawUnsafe(
      `UPDATE "DungeonRun" SET "floor" = ?, "pendingLootJson" = ? WHERE "id" = ?`,
      nextFloor,
      JSON.stringify(nextPending),
      run.id,
    );

    const finished = floor >= (input.dungeon.maxFloors ?? 20);
    if (finished) {
      // auto cashout on last floor win
      for (const x of nextPending) {
        const item = await tx.item.findUnique({ where: { id: x.itemId } });
        if (item?.category === "무기") {
          for (let i = 0; i < x.qty; i++) {
            await tx.weaponInstance.create({
              data: { userId: input.userId, baseItemId: x.itemId, enhanceLevel: 0, optionsJson: "[]" },
            });
          }
          continue;
        }
        await tx.inventoryStack.upsert({
          where: { userId_itemId: { userId: input.userId, itemId: x.itemId } },
          create: { userId: input.userId, itemId: x.itemId, quantity: x.qty },
          update: { quantity: { increment: x.qty } },
        });
      }
      await tx.dungeonRun.update({ where: { id: run.id }, data: { status: "STOPPED" } });
      await (tx as any).$executeRawUnsafe(
        `UPDATE "DungeonRun" SET "pendingLootJson" = '[]' WHERE "id" = ?`,
        run.id,
      );
      return {
        ok: true as const,
        result: "WIN_AND_CASHOUT" as const,
        floor,
        partyPower,
        winRate,
        lootGained: gained,
        pendingLoot: [] as LootEntry[],
        cashedOut: nextPending,
      };
    }

    return {
      ok: true as const,
      result: "WIN" as const,
      floor,
      partyPower,
      winRate,
      lootGained: gained,
      pendingLoot: nextPending,
    };
  });
}

export async function cashoutPushLuckRun(input: { userId: string; dungeon: DungeonDef }) {
  if (input.dungeon.mode !== "PUSH_LUCK") throw new Error("NOT_PUSH_LUCK_DUNGEON");
  return prisma.$transaction(async (tx) => {
    const run = await tx.dungeonRun.findFirst({
      where: { userId: input.userId, status: "RUNNING", dungeonId: input.dungeon.id },
      orderBy: { startedAt: "desc" },
    });
    if (!run) throw new Error("DUNGEON_RUN_NOT_FOUND");
    const extra = (await (tx as any).$queryRawUnsafe(
      `SELECT "pendingLootJson" as pendingLootJson FROM "DungeonRun" WHERE "id" = ? LIMIT 1`,
      run.id,
    )) as any;
    const e0 = Array.isArray(extra) ? extra[0] : extra;
    const pending = safeParsePendingLoot(e0?.pendingLootJson ?? "[]");
    for (const x of pending) {
      const item = await tx.item.findUnique({ where: { id: x.itemId } });
      if (item?.category === "무기") {
        for (let i = 0; i < x.qty; i++) {
          await tx.weaponInstance.create({
            data: { userId: input.userId, baseItemId: x.itemId, enhanceLevel: 0, optionsJson: "[]" },
          });
        }
        continue;
      }
      await tx.inventoryStack.upsert({
        where: { userId_itemId: { userId: input.userId, itemId: x.itemId } },
        create: { userId: input.userId, itemId: x.itemId, quantity: x.qty },
        update: { quantity: { increment: x.qty } },
      });
    }
    await tx.dungeonRun.update({ where: { id: run.id }, data: { status: "STOPPED" } });
    await (tx as any).$executeRawUnsafe(`UPDATE "DungeonRun" SET "pendingLootJson" = '[]' WHERE "id" = ?`, run.id);
    return { ok: true as const, cashedOut: pending };
  });
}

