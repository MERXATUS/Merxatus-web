import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import {
  countPvpAttacksToday,
  listPvpOpponents,
  loadRepresentativeCombat,
  PVP_BOARD_KEY,
  PVP_DAILY_ATTACK_LIMIT,
  PVP_SEASON_KEY,
} from "@/server/pvpRun";
import { prisma } from "@/server/db";
import { getUserLeaderboardRank } from "@/server/leaderboard";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const [opponents, myCombat, attacksToday, rank] = await Promise.all([
      listPvpOpponents(auth.userId),
      loadRepresentativeCombat(prisma, auth.userId),
      countPvpAttacksToday(auth.userId),
      getUserLeaderboardRank({
        userId: auth.userId,
        boardKey: PVP_BOARD_KEY,
        seasonKey: PVP_SEASON_KEY,
      }),
    ]);

    return Response.json({
      ok: true as const,
      hasRepresentative: !!myCombat,
      myCombat: myCombat
        ? {
            minionId: myCombat.minion.id,
            combatClassLabel: myCombat.member.combatClassLabel,
            level: myCombat.minion.level,
            combatPower: myCombat.member.power,
          }
        : null,
      opponents,
      dailyLimit: PVP_DAILY_ATTACK_LIMIT,
      attacksToday,
      remainingAttacks: Math.max(0, PVP_DAILY_ATTACK_LIMIT - attacksToday),
      rank,
    });
  } catch (e) {
    return jsonApiError(e);
  }
}
