import { requireUserId } from "@/server/auth";
import { listFriendships } from "@/server/friends";
import { jsonApiError } from "@/server/apiRouteError";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const data = await listFriendships(auth.userId);
    return Response.json({ ok: true, ...data });
  } catch (e) {
    return jsonApiError(e);
  }
}
