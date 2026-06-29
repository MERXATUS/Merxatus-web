import { requireUserId } from "@/server/auth";
import { getTowerPensionState } from "@/server/towerPension";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = requireUserId(req, url.searchParams.get("userId"));
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const state = await getTowerPensionState(auth.userId);
    return Response.json(state);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
