import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { startTowerRun } from "@/server/towerRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionIds: z.array(z.string().min(1)).min(1).max(3),
});

export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  try {
    const out = await startTowerRun({ userId: auth.userId, minionIds: parsed.data.minionIds });
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
