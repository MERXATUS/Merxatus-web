import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { getAutoExploreState, tickAutoExploreRun } from "@/server/autoExploreRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  commitLoot: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const tick = await tickAutoExploreRun({
      userId: auth.userId,
      commitLoot: parsed.data.commitLoot,
    });
    const state = await getAutoExploreState(auth.userId);
    return Response.json({ ...tick, state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status = message === "NO_ACTIVE_AUTO_RUN" ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
