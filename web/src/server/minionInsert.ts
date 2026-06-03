import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { grantAndEquipStarterSword } from "@/server/minionStarterKit";
import { rollMinionBaseStats, type MinionBaseStats } from "@/shared/minionBaseStats";

type MinionWriteClient = Pick<PrismaClient, "minion" | "weaponInstance"> | Prisma.TransactionClient;

export async function createMinionWithBirth(
  db: MinionWriteClient,
  input: { userId: string; level: number; baseStats?: MinionBaseStats },
) {
  const id = randomUUID();
  const stats = input.baseStats ?? rollMinionBaseStats();
  await db.minion.create({
    data: {
      id,
      userId: input.userId,
      level: input.level,
      jobType: "ADVENTURER",
      strength: stats.strength,
      agility: stats.agility,
      intelligence: stats.intelligence,
      endurance: stats.endurance,
    },
  });
  await grantAndEquipStarterSword(db, input.userId, id);
  return db.minion.findUniqueOrThrow({ where: { id } });
}
