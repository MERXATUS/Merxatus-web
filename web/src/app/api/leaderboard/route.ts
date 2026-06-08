import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { getUserLeaderboardRank, listLeaderboard } from "@/server/leaderboard";
import { resolveLeaderboardBoard } from "@/server/leaderboardBoards";

export const runtime = "nodejs";

const QuerySchema = z.object({
  boardKey: z.string().min(1),
  seasonKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      boardKey: url.searchParams.get("boardKey"),
      seasonKey: url.searchParams.get("seasonKey") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const board = await resolveLeaderboardBoard(parsed.data.boardKey);
    if (!board) return Response.json({ ok: false, error: "UNKNOWN_BOARD" }, { status: 404 });

    const seasonKey = parsed.data.seasonKey ?? board.seasonKey;
    const limit = parsed.data.limit ?? 20;

    const [leaderboard, rank] = await Promise.all([
      listLeaderboard({ boardKey: board.boardKey, seasonKey, limit }),
      getUserLeaderboardRank({ userId: auth.userId, boardKey: board.boardKey, seasonKey }),
    ]);

    return Response.json({
      ok: true as const,
      board,
      seasonKey,
      rank,
      leaderboard,
    });
  } catch (e) {
    return jsonApiError(e);
  }
}
