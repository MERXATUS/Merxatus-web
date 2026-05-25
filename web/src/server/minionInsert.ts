import { randomUUID } from "node:crypto";
import type { MinionJobType, Prisma, PrismaClient } from "@prisma/client";

type MinionWriteClient = Pick<PrismaClient, "minion"> | Prisma.TransactionClient;

export async function createMinionWithBirth(
  db: MinionWriteClient,
  input: { userId: string; level: number; jobType: MinionJobType },
) {
  const id = randomUUID();
  return db.minion.create({
    data: {
      id,
      userId: input.userId,
      level: input.level,
      jobType: input.jobType,
    },
  });
}
