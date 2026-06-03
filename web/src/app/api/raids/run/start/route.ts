import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { startRaidRun } from "@/server/raidRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  raidId: z.string().min(1),
  minionIds: z.array(z.string().min(1)).min(1).max(3),
});

export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  try {
    const out = await startRaidRun({ userId: auth.userId, ...parsed.data });
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    if (/does not exist|RaidRun|P2021/i.test(message)) return jsonApiError(e);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
