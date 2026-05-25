import type { MinionJobType, Prisma, PrismaClient } from "@prisma/client";

import { createMinionWithBirth } from "@/server/minionInsert";

import { MINION_JOB_LABEL } from "@/server/minionJobs";

import {

  assertCanGrantGatherMinion,

  countGatherMinions,

  MAX_GATHER_MINIONS,

  syncMinionInventoryCaps,

} from "@/server/minionCapacity";

import { tutorialIsDone } from "@/shared/tutorial";



type Db = Pick<PrismaClient, "minion" | "minionInventory"> | Prisma.TransactionClient;



export type TutorialMinionGrant = {

  granted: boolean;

  jobType: MinionJobType;

  minionId?: string;

  message: string;

};



async function hasJob(db: Db, userId: string, jobType: MinionJobType) {

  const n = await db.minion.count({ where: { userId, jobType } });

  return n > 0;

}



/** 튜토리얼 보상·준비용 미니언 1명 지급 (이미 해당 직업이 있으면 스킵) */

export async function grantTutorialMinionIfNeeded(

  db: Db,

  userId: string,

  jobType: Extract<MinionJobType, "MINER" | "FISHER">,

): Promise<TutorialMinionGrant> {

  const label = MINION_JOB_LABEL[jobType];



  if (await hasJob(db, userId, jobType)) {

    return { granted: false, jobType, message: `이미 ${label} 미니언이 있어요.` };

  }



  const gatherCount = await countGatherMinions(db, userId);

  if (gatherCount >= MAX_GATHER_MINIONS) {

    return {

      granted: false,

      jobType,

      message: `수집 미니언 보유 한도(${MAX_GATHER_MINIONS}명)에 도달해 ${label}을 지급할 수 없어요.`,

    };

  }



  try {

    assertCanGrantGatherMinion(gatherCount);

  } catch {

    return {

      granted: false,

      jobType,

      message: `수집 미니언 보유 한도(${MAX_GATHER_MINIONS}명)에 도달해 ${label}을 지급할 수 없어요.`,

    };

  }



  const created = await createMinionWithBirth(db, {
    userId,
    level: 1,
    jobType,
  });

  await syncMinionInventoryCaps(db, userId);



  return {

    granted: true,

    jobType,

    minionId: created.id,

    message: `튜토리얼 보상: ${label} 미니언을 받았어요.`,

  };

}



/** 광산 수령(1단계) 완료 직후 — 낚시터용 낚시꾼 지급 */

export async function grantTutorialRewardAfterMineCollect(db: Db, userId: string) {

  return grantTutorialMinionIfNeeded(db, userId, "FISHER");

}



/**

 * 튜토리얼 단계에 맞춰 빠진 보상 미니언을 채운다.

 * - 0단계: 광부

 * - 1단계 이상(광산 클리어 후): 낚시꾼 (누락 시 재지급)

 */

export async function syncTutorialMinionsForStep(db: Db, userId: string, tutorialStep: number) {

  if (tutorialIsDone(tutorialStep)) return [] as TutorialMinionGrant[];



  const grants: TutorialMinionGrant[] = [];



  if (tutorialStep === 0) {

    grants.push(await grantTutorialMinionIfNeeded(db, userId, "MINER"));

  }



  if (tutorialStep >= 1) {

    grants.push(await grantTutorialMinionIfNeeded(db, userId, "FISHER"));

  }



  return grants;

}



/** 수령 API 등에서 광산 클리어 직후 한 번 더 낚시꾼 지급 시도 */

export async function ensureTutorialFisherReward(db: Db, userId: string, tutorialStep: number) {

  if (tutorialStep < 1 || tutorialIsDone(tutorialStep)) {

    return { granted: false, jobType: "FISHER" as const, message: "" };

  }

  return grantTutorialMinionIfNeeded(db, userId, "FISHER");

}



/** @deprecated syncMinionInventoryCaps 사용 */

export async function syncMinionOwnedCapToCount(db: Db, userId: string) {

  const { owned } = await syncMinionInventoryCaps(db, userId);

  return owned;

}

