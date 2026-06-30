import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { startRaidRun } from "@/server/raidRun";
import { prisma } from "@/server/db";
import { resolveSoloMinionIds } from "@/server/minionSolo";

export const runtime = "nodejs";

const BodySchema = z.object({
  raidId: z.string().min(1),
  minionIds: z.array(z.string().min(1)).min(1).max(1).optional(),
});

export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  try {
    const minionIds =
      parsed.data.minionIds?.length === 1
        ? parsed.data.minionIds
        : await resolveSoloMinionIds(prisma, auth.userId, 1);
    const out = await startRaidRun({ userId: auth.userId, raidId: parsed.data.raidId, minionIds });
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    if (/does not exist|RaidRun|P2021/i.test(message)) return jsonApiError(e);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
