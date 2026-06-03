import { requireUserId } from "@/server/auth";
import { stopRaidRun } from "@/server/raidRun";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  try {
    const out = await stopRaidRun(auth.userId);
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
