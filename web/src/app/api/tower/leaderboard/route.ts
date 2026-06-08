import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { getUserLeaderboardRank, listLeaderboard } from "@/server/leaderboard";
import { loadTowerConfig } from "@/server/towerData";

export const runtime = "nodejs";

/** @deprecated Prefer GET /api/leaderboard?boardKey=tower */
export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const config = await loadTowerConfig();
    const [leaderboard, rank] = await Promise.all([
      listLeaderboard({
        boardKey: config.leaderboardBoardKey,
        seasonKey: config.seasonKey,
        limit: 10,
      }),
      getUserLeaderboardRank({
        userId: auth.userId,
        boardKey: config.leaderboardBoardKey,
        seasonKey: config.seasonKey,
      }),
    ]);

    return Response.json({
      ok: true as const,
      seasonKey: config.seasonKey,
      rank,
      leaderboard,
    });
  } catch (e) {
    return jsonApiError(e);
  }
}