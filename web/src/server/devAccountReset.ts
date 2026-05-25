import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export type DevAccountResetResult = {
  fields: string[];
  warning?: string;
};

function rawQueryFailed(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2010";
}

/** 인벤·골드는 유지. 튜토리얼·전문 직업만 처음 상태로. (Prisma update 대신 raw — 클라이언트/스키마 불일치 회피) */
export async function resetTutorialAndSpecialistForDev(
  prisma: PrismaClient,
  userId: string,
): Promise<DevAccountResetResult> {
  const fields: string[] = [];
  let warning: string | undefined;

  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "User"
      SET
        "tutorialStep" = 0,
        "specialistUnlocked" = false,
        "specialistProfession" = NULL::"SpecialistProfession"
      WHERE "id" = ${userId}
    `);
    fields.push("tutorialStep", "specialistUnlocked", "specialistProfession");
    return { fields, warning };
  } catch (e) {
    if (!rawQueryFailed(e)) throw e;
  }

  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "User"
      SET
        "specialistUnlocked" = false,
        "specialistProfession" = NULL::"SpecialistProfession"
      WHERE "id" = ${userId}
    `);
    fields.push("specialistUnlocked", "specialistProfession");
  } catch (e) {
    throw e;
  }

  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "User" SET "tutorialStep" = 0 WHERE "id" = ${userId}
    `);
    fields.push("tutorialStep");
  } catch {
    warning =
      '전문 직업은 초기화됐지만 tutorialStep 컬럼이 없거나 갱신에 실패했어요. `npx prisma db push` 후 dev 서버를 재시작해 주세요.';
  }

  return { fields, warning };
}
