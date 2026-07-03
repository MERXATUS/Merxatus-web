import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  TUTORIAL_DONE,
  TUTORIAL_STEPS,
  migrateLegacyTutorialStep,
  tutorialCurrentStep,
  tutorialIsDone,
} from "@/shared/tutorial";
import { GACHA_STARTER_POOL_ID } from "@/shared/gachaShop";
import { type TutorialMinionGrant } from "@/server/tutorialMinionGrants";
import { grantLootToUser } from "@/server/grantLootToUser";
import { stackAvailableQty } from "@/server/inventoryStackOps";

type RawDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "minion" | "minionInventory" | "wallet" | "inventoryStack">;
type ItemGrantDb = Parameters<typeof grantLootToUser>[0];

export async function getTutorialStep(db: RawDb, userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ tutorialStep: number }[]>(Prisma.sql`
    SELECT "tutorialStep" FROM "User" WHERE "id" = ${userId} LIMIT 1
  `);
  const raw = rows[0]?.tutorialStep ?? 0;
  const step = migrateLegacyTutorialStep(raw);
  if (step !== raw) await setTutorialStep(db, userId, step);
  return step;
}

async function setTutorialStep(db: RawDb, userId: string, step: number) {
  await db.$executeRaw(Prisma.sql`
    UPDATE "User" SET "tutorialStep" = ${step} WHERE "id" = ${userId}
  `);
}

async function advanceTutorial(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialIsDone(cur)) {
    return {
      step: cur,
      done: true as const,
      advanced: false as const,
      minionGrants: [] as TutorialMinionGrant[],
    };
  }

  const next = cur + 1;
  const minionGrants: TutorialMinionGrant[] = [];

  if (next >= TUTORIAL_STEPS.length) {
    await setTutorialStep(db, userId, TUTORIAL_DONE);
    return { step: TUTORIAL_DONE, done: true as const, advanced: true as const, minionGrants };
  }

  await setTutorialStep(db, userId, next);
  return { step: next, done: false as const, advanced: true as const, minionGrants };
}

/** @deprecated 수집 시스템 제거 */
export async function tryTutorialGatherCollect(db: RawDb, userId: string, _workshopName: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
}

/** @deprecated 수집 시스템 제거 */
export async function tryTutorialGatherVisit(db: RawDb, userId: string, _workshopName: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur };
}

/** @deprecated 던전 정산 튜토리얼 제거 */
export async function tryTutorialDungeonCashout(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
}

/** @deprecated 제작 튜토리얼 제거 */
export async function tryTutorialFirstCraft(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
}

/** @deprecated 거래소 등록 튜토리얼 제거 */
export async function tryTutorialListOnMarket(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
}

/** @deprecated 거래소 방문 튜토리얼 제거 */
export async function tryTutorialVisitMarket(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur };
}

export async function tryTutorialGachaPull(db: RawDb, userId: string, poolId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "gacha_pull") {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  if (poolId !== GACHA_STARTER_POOL_ID) {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

/** 튜토리얼 강화 단계 — 골드 부족 시 +1 강화(150G) 1회 보장 */
export async function ensureTutorialEnhanceBudget(db: RawDb & ItemGrantDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "enhance_equipment") return;

  const wallet = await db.wallet.findUnique({
    where: { userId },
    select: { goldAvailable: true },
  });
  if ((wallet?.goldAvailable ?? 0) < 200) {
    await db.wallet.update({
      where: { userId },
      data: { goldAvailable: { increment: 300 } },
    });
  }

  const stack = await db.inventoryStack.findUnique({
    where: { userId_itemId: { userId, itemId: "item_lesser_mana_stone" } },
  });
  if (stackAvailableQty(stack ?? { quantity: 0, lockedQuantity: 0 }) < 1) {
    await grantLootToUser(db, userId, [{ itemId: "item_lesser_mana_stone", qty: 3 }]);
  }
}

export async function tryTutorialEnhanceEquipment(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "enhance_equipment") {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

export async function tryTutorialSellEquipment(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "sell_equipment") {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

export async function tryTutorialSpecialistChosen(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  return { advanced: false as const, step: cur };
}

export async function getTutorialState(db: RawDb, userId: string) {
  const step = await getTutorialStep(db, userId);
  const done = tutorialIsDone(step);
  const current = tutorialCurrentStep(step);
  return { step, done, current };
}
