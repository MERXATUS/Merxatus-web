import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Prisma 클라이언트 또는 트랜잭션 클라이언트 — generate가 스키마보다 낡아도 raw로 동작 */
type RawDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

export type UserSpecialistRow = {
  specialistUnlocked: boolean;
  specialistProfession: string | null;
};

export async function getUserSpecialistRow(db: RawDb, userId: string): Promise<UserSpecialistRow | null> {
  const rows = await db.$queryRaw<UserSpecialistRow[]>(Prisma.sql`
    SELECT "specialistUnlocked", "specialistProfession"::text AS "specialistProfession"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function setUserSpecialistUnlockedTrue(db: RawDb, userId: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE "User"
    SET "specialistUnlocked" = true
    WHERE "id" = ${userId}
  `);
}

export async function setUserSpecialistProfession(
  db: RawDb,
  userId: string,
  profession: "BLACKSMITH" | "ALCHEMIST" | "JEWELER",
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE "User"
    SET "specialistProfession" = CAST(${profession} AS "SpecialistProfession")
    WHERE "id" = ${userId}
  `);
}
