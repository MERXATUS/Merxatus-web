import { prisma } from "@/server/db";
import type { PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import { workshopMasterySnapshot } from "@/server/workshopMastery";
import { computeWorkshopLabor } from "@/server/workshopLabor";

/** `$transaction` 콜백에 넘어오는 클라이언트 타입 */
export type WorkshopPrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

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

function randIntInclusive(min: number, max: number, rnd: () => number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** GATHER: 실제 경과 ms를 8시간(규칙) 상한으로 잘라 틱 환산에만 사용 */
export function cappedGatherElapsedMs(elapsedMs: number): number {
  const cap = GAME_RULES.workshop.maxBankedRealTimeMs;
  if (cap == null || cap <= 0) return Math.max(0, elapsedMs);
  return Math.min(Math.max(0, elapsedMs), cap);
}

/** 같은 DB 트랜잭션 안에서 수집(자동 수령·수동 수령 공용) */
export async function collectWorkshopInTx(tx: WorkshopPrismaTx, input: { workshopId: string; userId: string }) {
  const workshop = await tx.workshopInstance.findUnique({
    where: { id: input.workshopId },
    include: {
      workshopType: {
        include: { drops: true },
      },
    },
  });
  if (!workshop) throw new Error("WORKSHOP_NOT_FOUND");
  if (workshop.userId !== input.userId) throw new Error("FORBIDDEN");

  const now = new Date();
  /** 배치 기준 직업 목록 → 특화 직업 보너스·시너지 반영 가동력. 배치 없으면 legacy minionCount만 사용 */
  const assignmentRows = await tx.workshopAssignment.findMany({
    where: { workshopId: workshop.id },
    include: { minion: { select: { jobType: true } } },
    take: 200,
  });
  const assignmentJobs = assignmentRows.map((r) => r.minion.jobType);
  const assignedTotal = assignmentRows.length;
  const labor =
    assignedTotal > 0
      ? computeWorkshopLabor(workshop.workshopType.name, assignmentJobs)
      : null;
  const rollLabor =
    assignedTotal > 0 && labor ? labor.laborScore : Math.max(0, workshop.minionCount);

  if (rollLabor <= 0) {
    await tx.workshopInstance.update({
      where: { id: workshop.id },
      data: { lastCollectedAt: now },
    });
    return {
      ok: true as const,
      produced: [] as Array<{ itemId: string; qty: number }>,
      rolls: 0,
      wholeTicks: 0,
      paidTicks: 0,
      upkeepCost: 0,
      note: "NO_MINIONS" as const,
    };
  }

  if (workshop.workshopType.kind !== "GATHER") {
    return {
      ok: true as const,
      produced: [] as Array<{ itemId: string; qty: number }>,
      rolls: 0,
      wholeTicks: 0,
      paidTicks: 0,
      upkeepCost: 0,
      note: "NOT_GATHER" as const,
    };
  }

  const masteryBefore = workshopMasterySnapshot(workshop.masteryXp);
  const rawElapsedMs = Math.max(0, now.getTime() - workshop.lastCollectedAt.getTime());
  const tickMs = masteryBefore.tickSeconds * 1000;
  const bankedMs = cappedGatherElapsedMs(rawElapsedMs);
  const wholeTicks = tickMs > 0 ? Math.floor(bankedMs / tickMs) : 0;
  if (wholeTicks <= 0) {
    throw new Error("COLLECT_NOT_READY");
  }

  const paidTicks = wholeTicks;
  const rolls = Math.floor(paidTicks * rollLabor);
  const allDrops = workshop.workshopType.drops;
  const tier = Math.max(1, Math.min(5, Math.floor(workshop.tier ?? 1)));
  // 기본은 "현재 티어 이하 전부" 누적 테이블.
  // 다만 광산은 유저가 티어별 확률을 고정으로 원해서, 해당 티어 전용(minTier===tier) 테이블을 우선 사용한다.
  const filteredByTier = allDrops.filter((d) => Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1))) <= tier);
  const exactTier = allDrops.filter((d) => Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1))) === tier);
  const exactTierNames = new Set(["광산"]);
  const drops =
    exactTierNames.has(workshop.workshopType.name) && exactTier.length > 0 ? exactTier : filteredByTier;
  if (drops.length === 0) throw new Error("DROP_TABLE_EMPTY");

  // 도구 장착 시: 희귀 드랍(minTier>=2) 가중치 보정
  const toolId = workshop.equippedToolItemId ?? null;
  const allowedMap = GAME_RULES.workshop.tool.allowedToolItemIdsByWorkshopName as Record<string, readonly string[]>;
  const allowed = allowedMap[workshop.workshopType.name] ?? [];
  const toolActive = !!toolId && allowed.includes(toolId);
  const rareMult = GAME_RULES.workshop.tool.rareWeightMultiplier;

  const weights = drops.map((d) => {
    const base = Math.max(0, d.weight);
    const minTier = Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)));
    if (!toolActive) return base;
    if (minTier < 2) return base;
    return Math.round(base * rareMult);
  });
  const producedMap = new Map<string, number>();
  const rnd = Math.random;

  for (let i = 0; i < rolls; i++) {
    const idx = pickWeightedIndex(weights, rnd);
    if (idx < 0) continue;
    const entry = drops[idx]!;
    const qty = randIntInclusive(entry.minQty, entry.maxQty, rnd);
    producedMap.set(entry.itemId, (producedMap.get(entry.itemId) ?? 0) + qty);
  }

  const producedIds = Array.from(producedMap.keys());
  const producedItems = producedIds.length
    ? await tx.item.findMany({
        where: { id: { in: producedIds } },
        select: { id: true, name: true, category: true },
        take: 500,
      })
    : [];
  const infoById = new Map(producedItems.map((it) => [it.id, { name: it.name, category: it.category }]));

  for (const [itemId, qty] of producedMap.entries()) {
    const cat = infoById.get(itemId)?.category ?? "";
    if (cat === "무기") {
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

  const gainedXp = Math.floor(paidTicks * rollLabor);
  await tx.workshopInstance.update({
    where: { id: workshop.id },
    data: {
      lastCollectedAt: now,
      masteryXp: { increment: gainedXp },
    },
  });

  const produced = Array.from(producedMap.entries()).map(([itemId, qty]) => ({ itemId, qty }));
  const producedCards = produced.map((p) => ({
    itemId: p.itemId,
    itemName: infoById.get(p.itemId)?.name ?? p.itemId,
    category: infoById.get(p.itemId)?.category ?? "",
    qty: p.qty,
  }));
  const masteryAfter = workshopMasterySnapshot(workshop.masteryXp + gainedXp);
  return {
    ok: true as const,
    produced,
    producedCards,
    rolls,
    wholeTicks,
    paidTicks,
    upkeepCost: 0,
    lastCollectedAt: now.toISOString(),
    mastery: {
      before: masteryBefore,
      after: masteryAfter,
      gainedXp,
    },
  };
}

export async function collectWorkshop(input: { workshopId: string; userId: string }) {
  return prisma.$transaction(async (tx) => collectWorkshopInTx(tx, input));
}
