import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { jsonApiError } from "@/server/apiRouteError";
import { runPvpAttack } from "@/server/pvpRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  defenderUserId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const result = await runPvpAttack(auth.userId, body.data.defenderUserId);
    return Response.json({ ok: true as const, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    if (
      msg === "REPRESENTATIVE_REQUIRED" ||
      msg === "DEFENDER_NOT_READY" ||
      msg === "CANNOT_ATTACK_SELF" ||
      msg === "PVP_DAILY_LIMIT"
    ) {
      return Response.json({ ok: false, error: msg }, { status: 400 });
    }
    return jsonApiError(e);
  }
}
