import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { listRaidsPayload } from "@/server/raidRun";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
    const out = await listRaidsPayload();
    return Response.json(out);
  } catch (e) {
    return jsonApiError(e);
  }
}
