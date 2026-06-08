import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { listPvpHistory } from "@/server/pvpRun";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const history = await listPvpHistory(auth.userId);
    return Response.json({ ok: true as const, history });
  } catch (e) {
    return jsonApiError(e);
  }
}
