import { randomUUID } from "node:crypto";
import type { MinionJobType, MinionGrade, Prisma, PrismaClient } from "@prisma/client";

type MinionWriteClient = PrismaClient | Prisma.TransactionClient;

/**
 * `prisma generate`가 실패·불일치(embedded schema에 Minion.grade 없음)해도
 * DB에 `grade` 컬럼이 있으면 부화/보정이 동작하도록 raw INSERT로 삽입한다.
 */
export async function createMinionWithBirth(
  db: MinionWriteClient,
  input: { userId: string; level: number; jobType: MinionJobType; grade: MinionGrade },
) {
  const id = randomUUID();
  const now = new Date();
  await db.$executeRaw`
    INSERT INTO "Minion" ("id", "userId", "level", "jobType", "grade", "createdAt", "updatedAt")
    VALUES (${id}, ${input.userId}, ${input.level}, ${input.jobType}, ${input.grade}, ${now}, ${now})
  `;
  return db.minion.findUniqueOrThrow({ where: { id } });
}
