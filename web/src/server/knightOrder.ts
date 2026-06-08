import type { PrismaClient } from "@prisma/client";
import { GAME_RULES } from "@/server/gameRules";
import {
  applyKnightOrderPartyPower,
  knightOrderBonusesFromTotalLevel,
  type KnightOrderBonuses,
} from "@/shared/knightOrder";

type MinionDb = Pick<PrismaClient, "minion">;

export async function sumMinionTotalLevel(db: MinionDb, userId: string) {
  const agg = await db.minion.aggregate({
    where: { userId },
    _sum: { level: true },
    _count: { id: true },
  });
  return {
    totalLevel: Math.max(0, Math.floor(agg._sum.level ?? 0)),
    minionCount: Math.max(0, agg._count.id ?? 0),
  };
}

export async function loadKnightOrderBonuses(db: MinionDb, userId: string): Promise<KnightOrderBonuses> {
  const { totalLevel, minionCount } = await sumMinionTotalLevel(db, userId);
  return knightOrderBonusesFromTotalLevel(totalLevel, minionCount, GAME_RULES.knightOrder);
}

export function scalePartyPowerWithKnightOrder(basePartyPower: number, bonuses: KnightOrderBonuses) {
  return applyKnightOrderPartyPower(basePartyPower, bonuses);
}
