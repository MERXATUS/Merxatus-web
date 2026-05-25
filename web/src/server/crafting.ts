import type { MinionJobType, PrismaClient, SpecialistProfession } from "@prisma/client";
import { prisma } from "@/server/db";
import { GAME_RULES } from "@/server/gameRules";
import type { RolledOption } from "@/server/itemOptions";
import { rollOptionsForCraft, serializeOptions } from "@/server/itemOptions";
import { computeWorkshopLabor } from "@/server/workshopLabor";
import { getUserSpecialistRow } from "@/server/userSpecialistDb";
import { requiredSpecialistForProcessWorkshop } from "@/shared/specialistProfession";

function processWorkshopTierCraftSpeedMult(tier: unknown): number {
  const t = Math.max(1, Math.min(5, Math.floor(Number(tier) || 1)));
  const map = GAME_RULES.workshop.processTierCraftSpeedMultByFromTier as unknown as Record<string, number>;
  const v = map[String(t)];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 1;
}

/** 트랜잭션 클라이언트 (제작 로직 공용) */
export type CraftTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

function pickWeighted<T extends { weight?: number | null }>(rows: T[], rnd = Math.random): T | null {
  const weights = rows.map((r) => Math.max(0, Number(r.weight ?? 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < rows.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return rows[i] ?? null;
  }
  return rows[rows.length - 1] ?? null;
}

function randIntInclusive(min: number, max: number, rnd = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

type RecipeCraftInclude = {
  inputs: { itemId: string; quantity: number }[];
  outputs: {
    itemId: string;
    weight: number | null;
    minQty: number;
    maxQty: number;
  }[];
  workshopType: { name: string };
};

async function assertInputsAvailable(
  tx: CraftTx,
  userId: string,
  recipe: RecipeCraftInclude,
  qty: number,
) {
  for (const i of recipe.inputs) {
    const need = i.quantity * qty;
    const stack = await tx.inventoryStack.findUnique({
      where: { userId_itemId: { userId, itemId: i.itemId } },
    });
    const have = stack?.quantity ?? 0;
    if (have < need) throw new Error(`INSUFFICIENT_INPUT:${i.itemId}`);
  }
}

async function consumeInputs(tx: CraftTx, userId: string, recipe: RecipeCraftInclude, qty: number) {
  for (const i of recipe.inputs) {
    const need = i.quantity * qty;
    await tx.inventoryStack.update({
      where: { userId_itemId: { userId, itemId: i.itemId } },
      data: { quantity: { decrement: need } },
    });
  }
}

async function assignmentJobTypesForWorkshop(tx: CraftTx, workshopId: string): Promise<MinionJobType[]> {
  const rows = await tx.workshopAssignment.findMany({
    where: { workshopId },
    include: { minion: { select: { jobType: true } } },
    take: 200,
  });
  return rows.map((r) => r.minion.jobType);
}

/** 입력 차감 없이 출력·보상만 처리 (가공 완료 수령 / 즉시 소모처 공통) */
export async function deliverRecipeCraft(
  tx: CraftTx,
  input: {
    userId: string;
    recipe: RecipeCraftInclude & { id: string; name: string; rewardGold: number };
    quantity: number;
    /** 특화 직업·시너지 산출 배수 (CONSUME 등) */
    outputMult?: number;
  },
) {
  const { userId, recipe } = input;
  const qty = Math.max(1, Math.floor(input.quantity));
  const outputMult = Math.min(3, Math.max(0.25, Number(input.outputMult ?? 1)));

  const produced = new Map<string, number>();
  const outputs = recipe.outputs;
  const anyWeighted = outputs.some((o) => o.weight != null);

  for (let n = 0; n < qty; n++) {
    if (anyWeighted) {
      const pick = pickWeighted(outputs);
      if (!pick) continue;
      const outQty = randIntInclusive(pick.minQty, pick.maxQty);
      produced.set(pick.itemId, (produced.get(pick.itemId) ?? 0) + outQty);
    } else {
      for (const o of outputs) {
        const outQty = randIntInclusive(o.minQty, o.maxQty);
        produced.set(o.itemId, (produced.get(o.itemId) ?? 0) + outQty);
      }
    }
  }

  if (outputMult !== 1) {
    for (const [itemId, q] of [...produced.entries()]) {
      produced.set(itemId, Math.max(0, Math.round(q * outputMult)));
    }
  }

  const producedIds = Array.from(produced.keys());
  const producedItems = producedIds.length
    ? await tx.item.findMany({
        where: { id: { in: producedIds } },
        select: { id: true, name: true, category: true, grade: true },
        take: 500,
      })
    : [];
  const infoById = new Map(
    producedItems.map((it) => [it.id, { name: it.name, category: it.category, grade: it.grade }]),
  );

  const craftInstances: Array<{
    itemId: string;
    itemName: string;
    kind: "weapon" | "tool";
    instanceId: string;
    options: RolledOption[];
  }> = [];

  for (const [itemId, q] of produced.entries()) {
    const meta = infoById.get(itemId);
    const cat = meta?.category ?? "";
    const itemGrade = Math.max(1, Math.min(8, Math.floor(meta?.grade ?? 1)));

    if (cat === "무기") {
      for (let i = 0; i < q; i++) {
        const options = rollOptionsForCraft({ category: "무기", itemGrade });
        const inst = await tx.weaponInstance.create({
          data: {
            userId,
            baseItemId: itemId,
            enhanceLevel: 0,
            optionsJson: serializeOptions(options),
          },
        });
        craftInstances.push({
          itemId,
          itemName: meta?.name ?? itemId,
          kind: "weapon",
          instanceId: inst.id,
          options,
        });
      }
      continue;
    }
    if (cat === "도구") {
      for (let i = 0; i < q; i++) {
        const options = rollOptionsForCraft({ category: "도구", itemGrade });
        const inst = await tx.toolInstance.create({
          data: {
            userId,
            baseItemId: itemId,
            optionsJson: serializeOptions(options),
          },
        });
        craftInstances.push({
          itemId,
          itemName: meta?.name ?? itemId,
          kind: "tool",
          instanceId: inst.id,
          options,
        });
      }
      continue;
    }
    await tx.inventoryStack.upsert({
      where: { userId_itemId: { userId, itemId } },
      create: { userId, itemId, quantity: q },
      update: { quantity: { increment: q } },
    });
  }

  const rewardGold = Math.max(0, Math.floor(recipe.rewardGold * qty * outputMult));
  if (rewardGold > 0) {
    await tx.wallet.upsert({
      where: { userId },
      create: { userId, goldAvailable: rewardGold, goldLocked: 0 },
      update: { goldAvailable: { increment: rewardGold } },
    });
  }

  return {
    ok: true as const,
    recipeId: recipe.id,
    recipeName: recipe.name,
    workshopName: recipe.workshopType.name,
    quantity: qty,
    produced: Array.from(produced.entries()).map(([itemId, q]) => ({ itemId, qty: q })),
    producedCards: Array.from(produced.entries())
      .filter(([itemId]) => {
        const cat = infoById.get(itemId)?.category ?? "";
        return cat !== "무기" && cat !== "도구";
      })
      .map(([itemId, q]) => ({
        itemId,
        itemName: infoById.get(itemId)?.name ?? itemId,
        category: infoById.get(itemId)?.category ?? "",
        qty: q,
      })),
    craftedInstances: craftInstances,
    rewardGold,
  };
}

/** 2차 소모(CONSUME): 즉시 재료 소모 + 산출 */
export async function craftRecipe(input: {
  userId: string;
  workshopId: string;
  recipeId: string;
  quantity: number;
}) {
  // 납품소(2차 소모처) 시스템 제거: 즉시 제작(consume) API는 더 이상 사용하지 않는다.
  throw new Error("CONSUME_DISABLED");

  const qty = Math.max(1, Math.floor(input.quantity));

  return prisma.$transaction(async (tx) => {
    const workshop = await tx.workshopInstance.findUnique({
      where: { id: input.workshopId },
      include: { workshopType: true },
    });
    if (!workshop) throw new Error("WORKSHOP_NOT_FOUND");
    if (workshop.userId !== input.userId) throw new Error("FORBIDDEN");
    const stationed = await tx.workshopAssignment.count({ where: { workshopId: workshop.id } });
    if (Math.max(stationed, workshop.minionCount) <= 0) throw new Error("NO_MINIONS_ASSIGNED");
    if (workshop.workshopType.kind !== "CONSUME") throw new Error("USE_TIMED_CRAFT_FOR_PROCESS");

    const recipe = await tx.recipe.findUnique({
      where: { id: input.recipeId },
      include: { inputs: true, outputs: true, workshopType: true },
    });
    if (!recipe) throw new Error("RECIPE_NOT_FOUND");
    if (recipe.workshopTypeId !== workshop.workshopTypeId) throw new Error("RECIPE_WORKSHOP_MISMATCH");
    if (recipe.workshopType.kind !== "CONSUME") throw new Error("RECIPE_WORKSHOP_KIND_MISMATCH");

    const needTier = Math.max(1, Math.min(5, Math.floor(recipe.minTier ?? 1)));
    const haveTier = Math.max(1, Math.min(5, Math.floor(workshop.tier ?? 1)));
    if (haveTier < needTier) throw new Error("RECIPE_TIER_TOO_LOW");

    await assertInputsAvailable(tx, input.userId, recipe, qty);
    await consumeInputs(tx, input.userId, recipe, qty);

    const jobs = await assignmentJobTypesForWorkshop(tx, workshop.id);
    const labor = computeWorkshopLabor(workshop.workshopType.name, jobs);

    return deliverRecipeCraft(tx, {
      userId: input.userId,
      recipe,
      quantity: qty,
      outputMult: labor.consumeOutputMult,
    });
  });
}

/** 가공(PROCESS): 입력 차감 후 제작 시작 — 완료는 completeProcessCraft */
export async function startProcessCraft(input: {
  userId: string;
  workshopId: string;
  recipeId: string;
  quantity: number;
}) {
  const qty = Math.max(1, Math.floor(input.quantity));

  return prisma.$transaction(async (tx) => {
    const workshop = await tx.workshopInstance.findUnique({
      where: { id: input.workshopId },
      include: { workshopType: true },
    });
    if (!workshop) throw new Error("WORKSHOP_NOT_FOUND");
    if (workshop.userId !== input.userId) throw new Error("FORBIDDEN");
    if (workshop.workshopType.kind !== "PROCESS") throw new Error("NOT_PROCESS_WORKSHOP");
    if (workshop.processCraftRecipeId) throw new Error("CRAFT_IN_PROGRESS");

    const userRow = await getUserSpecialistRow(tx, input.userId);
    if (!userRow) throw new Error("USER_NOT_FOUND");
    const req = requiredSpecialistForProcessWorkshop(workshop.workshopType.name);
    if (req == null) throw new Error("PROCESS_WORKSHOP_UNKNOWN");
    if (!userRow.specialistProfession) throw new Error("SPECIALIST_NOT_CHOSEN");
    if (userRow.specialistProfession !== req) throw new Error("SPECIALIST_MISMATCH");

    const recipe = await tx.recipe.findUnique({
      where: { id: input.recipeId },
      include: { inputs: true, outputs: true, workshopType: true },
    });
    if (!recipe) throw new Error("RECIPE_NOT_FOUND");
    if (recipe.workshopTypeId !== workshop.workshopTypeId) throw new Error("RECIPE_WORKSHOP_MISMATCH");
    if (recipe.workshopType.kind !== "PROCESS") throw new Error("RECIPE_WORKSHOP_KIND_MISMATCH");

    const needTier = Math.max(1, Math.min(5, Math.floor(recipe.minTier ?? 1)));
    const haveTier = Math.max(1, Math.min(5, Math.floor(workshop.tier ?? 1)));
    if (haveTier < needTier) throw new Error("RECIPE_TIER_TOO_LOW");

    await assertInputsAvailable(tx, input.userId, recipe, qty);
    await consumeInputs(tx, input.userId, recipe, qty);

    const craftTimeSeconds = Math.max(1, Math.floor(recipe.craftTimeSeconds ?? 60));
    const jobs = await assignmentJobTypesForWorkshop(tx, workshop.id);
    const labor = computeWorkshopLabor(workshop.workshopType.name, jobs, {
      workshopKind: "PROCESS",
      specialistProfession: userRow.specialistProfession as SpecialistProfession,
    });
    const started = new Date();
    /** 클라이언트 제작 연출 후 즉시 수령 — 서버 대기 시간 없음 */
    const endsAt = started;

    await tx.workshopInstance.update({
      where: { id: workshop.id },
      data: {
        processCraftRecipeId: recipe.id,
        processCraftStartedAt: started,
        processCraftEndsAt: endsAt,
        processCraftOutputMult: labor.consumeOutputMult,
        processCraftQuantity: qty,
      },
    });

    return {
      ok: true as const,
      recipeId: recipe.id,
      recipeName: recipe.name,
      workshopName: recipe.workshopType.name,
      quantity: qty,
      craftTimeSeconds,
      totalCraftTimeSeconds: 0,
      laborBonus: {
        matchingCount: labor.matchingCount,
        synergyMult: labor.synergyMult,
        craftSpeedMult: labor.craftSpeedMult,
      },
    };
  });
}

async function completeProcessCraftInTx(
  tx: CraftTx,
  input: { userId: string; workshopId: string },
  options?: { forceReady?: boolean },
) {
  const workshop = await tx.workshopInstance.findUnique({
    where: { id: input.workshopId },
    include: { workshopType: true },
  });
  if (!workshop) throw new Error("WORKSHOP_NOT_FOUND");
  if (workshop.userId !== input.userId) throw new Error("FORBIDDEN");
  if (workshop.workshopType.kind !== "PROCESS") throw new Error("NOT_PROCESS_WORKSHOP");

  const rid = workshop.processCraftRecipeId;
  if (!rid) throw new Error("NO_CRAFT_IN_PROGRESS");

  const recipe = await tx.recipe.findUnique({
    where: { id: rid },
    include: { inputs: true, outputs: true, workshopType: true },
  });
  if (!recipe) throw new Error("RECIPE_NOT_FOUND");

  const qty = Math.max(1, Math.floor(workshop.processCraftQuantity ?? 1));
  const started = workshop.processCraftStartedAt;
  if (!started) throw new Error("NO_CRAFT_IN_PROGRESS");

  const craftSec = Math.max(1, Math.floor(recipe.craftTimeSeconds ?? 60));
  const endsAtField = workshop.processCraftEndsAt;
  const readyAtMs = endsAtField
    ? endsAtField.getTime()
    : started.getTime() + craftSec * qty * 1000;
  const now = Date.now();
  if (!options?.forceReady && now < readyAtMs) {
    throw new Error(`CRAFT_NOT_READY:${readyAtMs - now}`);
  }

  const outMult =
    workshop.processCraftOutputMult != null && Number.isFinite(workshop.processCraftOutputMult)
      ? workshop.processCraftOutputMult
      : 1;

  const result = await deliverRecipeCraft(tx, {
    userId: input.userId,
    recipe,
    quantity: qty,
    outputMult: outMult,
  });

  await tx.workshopInstance.update({
    where: { id: workshop.id },
    data: {
      processCraftRecipeId: null,
      processCraftStartedAt: null,
      processCraftEndsAt: null,
      processCraftOutputMult: null,
      processCraftQuantity: 0,
    },
  });

  return { ...result, mode: "PROCESS_COMPLETE" as const };
}

/** 가공(PROCESS): 제작 시간 경과 후 산출 */
export async function completeProcessCraft(input: {
  userId: string;
  workshopId: string;
  forceReady?: boolean;
}) {
  return prisma.$transaction(async (tx) =>
    completeProcessCraftInTx(tx, input, { forceReady: input.forceReady }),
  );
}

/** 가공(PROCESS): 연출 후 즉시 제작·지급 (중간 대기 상태 없음) */
export async function runProcessCraft(input: {
  userId: string;
  workshopId: string;
  recipeId: string;
  quantity: number;
}) {
  const qty = Math.max(1, Math.floor(input.quantity));

  return prisma.$transaction(async (tx) => {
    let workshop = await tx.workshopInstance.findUnique({
      where: { id: input.workshopId },
      include: { workshopType: true },
    });
    if (!workshop) throw new Error("WORKSHOP_NOT_FOUND");
    if (workshop.userId !== input.userId) throw new Error("FORBIDDEN");
    if (workshop.workshopType.kind !== "PROCESS") throw new Error("NOT_PROCESS_WORKSHOP");

    if (workshop.processCraftRecipeId) {
      throw new Error("CRAFT_IN_PROGRESS");
    }

    const userRow = await getUserSpecialistRow(tx, input.userId);
    if (!userRow) throw new Error("USER_NOT_FOUND");
    const req = requiredSpecialistForProcessWorkshop(workshop.workshopType.name);
    if (req == null) throw new Error("PROCESS_WORKSHOP_UNKNOWN");
    if (!userRow.specialistProfession) throw new Error("SPECIALIST_NOT_CHOSEN");
    if (userRow.specialistProfession !== req) throw new Error("SPECIALIST_MISMATCH");

    const recipe = await tx.recipe.findUnique({
      where: { id: input.recipeId },
      include: { inputs: true, outputs: true, workshopType: true },
    });
    if (!recipe) throw new Error("RECIPE_NOT_FOUND");
    if (recipe.workshopTypeId !== workshop.workshopTypeId) throw new Error("RECIPE_WORKSHOP_MISMATCH");
    if (recipe.workshopType.kind !== "PROCESS") throw new Error("RECIPE_WORKSHOP_KIND_MISMATCH");

    const needTier = Math.max(1, Math.min(5, Math.floor(recipe.minTier ?? 1)));
    const haveTier = Math.max(1, Math.min(5, Math.floor(workshop.tier ?? 1)));
    if (haveTier < needTier) throw new Error("RECIPE_TIER_TOO_LOW");

    await assertInputsAvailable(tx, input.userId, recipe, qty);
    await consumeInputs(tx, input.userId, recipe, qty);

    const jobs = await assignmentJobTypesForWorkshop(tx, workshop.id);
    const labor = computeWorkshopLabor(workshop.workshopType.name, jobs, {
      workshopKind: "PROCESS",
      specialistProfession: userRow.specialistProfession as SpecialistProfession,
    });

    const result = await deliverRecipeCraft(tx, {
      userId: input.userId,
      recipe,
      quantity: qty,
      outputMult: labor.consumeOutputMult,
    });

    return { ...result, mode: "PROCESS_RUN" as const };
  });
}
