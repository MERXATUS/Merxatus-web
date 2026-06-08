import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { listLeaderboardBoardDefs } from "@/server/leaderboardBoards";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const boards = await listLeaderboardBoardDefs();
    return Response.json({ ok: true as const, boards });
  } catch (e) {
    return jsonApiError(e);
  }
}
