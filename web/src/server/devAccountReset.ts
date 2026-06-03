import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type DevAccountResetResult = {
  fields: string[];
  warning?: string;
};

/** 인벤·골드는 유지. 튜토리얼만 처음 상태로. */
export async function resetTutorialAndSpecialistForDev(
  prisma: PrismaClient,
  userId: string,
): Promise<DevAccountResetResult> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "User" SET "tutorialStep" = 0 WHERE "id" = ${userId}
  `);
  return { fields: ["tutorialStep"] };
}
