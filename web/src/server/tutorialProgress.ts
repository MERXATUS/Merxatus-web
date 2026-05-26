import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  TUTORIAL_DONE,
  TUTORIAL_STEPS,
  migrateLegacyTutorialStep,
  tutorialCurrentStep,
  tutorialIsDone,
  type TutorialStepId,
} from "@/shared/tutorial";
import { setUserSpecialistUnlockedTrue } from "@/server/userSpecialistDb";
import { type TutorialMinionGrant } from "@/server/tutorialMinionGrants";

type RawDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "minion" | "minionInventory">;

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
  const nextDef = TUTORIAL_STEPS[next];
  if (nextDef?.id === "choose_specialist") {
    await setUserSpecialistUnlockedTrue(db, userId);
  }

  return { step: next, done: false as const, advanced: true as const, minionGrants };
}

function stepMatchesGatherEvent(
  stepId: TutorialStepId,
  workshopName: string,
  mode: "collect" | "visit",
): boolean {
  const def = TUTORIAL_STEPS.find((s) => s.id === stepId);
  if (!def?.gatherWorkshopName || def.gatherWorkshopName !== workshopName) return false;
  if (def.gatherRequiresCollect) return mode === "collect";
  return mode === "visit" || mode === "collect";
}

export async function tryTutorialGatherCollect(db: RawDb, userId: string, workshopName: string) {
  const cur = await getTutorialStep(db, userId);
  const active = tutorialCurrentStep(cur);
  if (!active?.gatherWorkshopName) {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  if (!stepMatchesGatherEvent(active.id, workshopName, "collect")) {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

export async function tryTutorialGatherVisit(db: RawDb, userId: string, workshopName: string) {
  const cur = await getTutorialStep(db, userId);
  const active = tutorialCurrentStep(cur);
  if (!active?.gatherWorkshopName) return { advanced: false as const, step: cur };
  if (!stepMatchesGatherEvent(active.id, workshopName, "visit")) return { advanced: false as const, step: cur };
  return advanceTutorial(db, userId);
}

export async function tryTutorialFirstCraft(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "first_craft") {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

export async function tryTutorialListOnMarket(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "list_on_market") {
    return { advanced: false as const, step: cur, minionGrants: [] as TutorialMinionGrant[] };
  }
  return advanceTutorial(db, userId);
}

export async function tryTutorialVisitMarket(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "visit_market") return { advanced: false as const, step: cur };
  return advanceTutorial(db, userId);
}

export async function tryTutorialSpecialistChosen(db: RawDb, userId: string) {
  const cur = await getTutorialStep(db, userId);
  if (tutorialCurrentStep(cur)?.id !== "choose_specialist") return { advanced: false as const, step: cur };
  return advanceTutorial(db, userId);
}

export async function getTutorialState(db: RawDb, userId: string) {
  const step = await getTutorialStep(db, userId);
  const done = tutorialIsDone(step);
  const current = tutorialCurrentStep(step);
  return { step, done, current };
}
