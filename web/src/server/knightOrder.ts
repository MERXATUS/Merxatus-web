import type { PrismaClient } from "@prisma/client";
import type { PartyCombatDb } from "@/server/minionCombatBuild";
import {
  applyKnightOrderPartyPower,
  ZERO_KNIGHT_ORDER_BONUSES,
  type KnightOrderBonuses,
} from "@/shared/knightOrder";

/** @deprecated 기사단 비활성 */
export const KNIGHT_ORDER_CP_STEP = 50;

type MinionDb = Pick<PrismaClient, "minion"> & PartyCombatDb;

export function invalidateKnightOrderCache(_userId?: string) {
  /* no-op */
}

/** 기사단 비활성 — 항상 보너스 0 */
export async function loadKnightOrderBonuses(_db: MinionDb, _userId: string): Promise<KnightOrderBonuses> {
  return ZERO_KNIGHT_ORDER_BONUSES;
}

export async function sumMinionTotalCombatPower(_db: MinionDb, _userId: string) {
  return { totalCombatPower: 0, minionCount: 1 };
}

export async function sumMinionTotalLevel(db: MinionDb, userId: string) {
  const r = await sumMinionTotalCombatPower(db, userId);
  return { totalLevel: r.totalCombatPower, minionCount: r.minionCount };
}

export function scalePartyPowerWithKnightOrder(basePartyPower: number, _bonuses: KnightOrderBonuses) {
  return applyKnightOrderPartyPower(basePartyPower, ZERO_KNIGHT_ORDER_BONUSES);
}

export async function minionCombatPowerForEquip(
  db: PartyCombatDb,
  userId: string,
  minion: { id: string; level: number; jobType: string; equippedWeaponInstanceId: string | null } & Record<string, unknown>,
): Promise<number> {
  const { computeMinionCombatPowerForUser } = await import("@/server/minionCombatBuild");
  return computeMinionCombatPowerForUser(db, userId, minion);
}
