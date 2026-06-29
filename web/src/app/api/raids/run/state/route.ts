import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { getRaidRunState } from "@/server/raidRun";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const lite = new URL(req.url).searchParams.get("lite") !== "0";
    const out = await getRaidRunState(auth.userId, { lite });
    return Response.json(out);
  } catch (e) {
    return jsonApiError(e);
  }
}
