import type { Prisma, PrismaClient } from "@prisma/client";

import { createMinionWithBirth } from "@/server/minionInsert";
import { countDungeonMinions, MAX_DUNGEON_MINIONS, syncMinionInventoryCaps } from "@/server/minionCapacity";
import { tutorialIsDone } from "@/shared/tutorial";

type Db = Pick<PrismaClient, "minion" | "minionInventory" | "weaponInstance"> | Prisma.TransactionClient;

export type TutorialMinionGrant = {
  granted: boolean;
  minionId?: string;
  message: string;
};

/** 튜토리얼 보상·준비용 던전 모험가 1명 지급 */
export async function grantTutorialMinionIfNeeded(db: Db, userId: string): Promise<TutorialMinionGrant> {
  const dungeonCount = await countDungeonMinions(db, userId);
  if (dungeonCount > 0) {
    return { granted: false, message: "이미 미니언이 있어요." };
  }

  if (dungeonCount >= MAX_DUNGEON_MINIONS) {
    return {
      granted: false,
      message: `미니언 보유 한도(${MAX_DUNGEON_MINIONS}명)에 도달해 지급할 수 없어요.`,
    };
  }

  const created = await createMinionWithBirth(db, { userId, level: 1 });
  await syncMinionInventoryCaps(db, userId);

  return {
    granted: true,
    minionId: created.id,
    message: "튜토리얼 보상: 모험가를 받았어요.",
  };
}

/** @deprecated grantTutorialMinionIfNeeded 사용 */
export async function grantTutorialRewardAfterMineCollect(db: Db, userId: string) {
  return grantTutorialMinionIfNeeded(db, userId);
}

/** 튜토리얼 단계에 맞춰 빠진 보상 미니언을 채운다. */
export async function syncTutorialMinionsForStep(db: Db, userId: string, tutorialStep: number) {
  if (tutorialIsDone(tutorialStep)) return [] as TutorialMinionGrant[];

  const grants: TutorialMinionGrant[] = [];
  if (tutorialStep === 0) {
    grants.push(await grantTutorialMinionIfNeeded(db, userId));
  }
  return grants;
}

/** @deprecated syncTutorialMinionsForStep / grantTutorialMinionIfNeeded 사용 */
export async function ensureTutorialFisherReward(db: Db, userId: string, tutorialStep: number) {
  if (tutorialStep < 1 || tutorialIsDone(tutorialStep)) {
    return { granted: false, message: "" };
  }
  return grantTutorialMinionIfNeeded(db, userId);
}

/** @deprecated syncMinionInventoryCaps 사용 */
export async function syncMinionOwnedCapToCount(db: Db, userId: string) {
  const { owned } = await syncMinionInventoryCaps(db, userId);
  return owned;
}
