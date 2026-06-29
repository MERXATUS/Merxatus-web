import { requireUserId } from "@/server/auth";
import { loadSetCodexPayload } from "@/server/setCodex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const payload = await loadSetCodexPayload(auth.userId);
    return Response.json({ ok: true, ...payload });
  } catch (e) {
    console.error("[api/codex/sets]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
