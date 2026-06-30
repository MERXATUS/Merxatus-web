import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveSoloMinionId } from "@/server/minionSolo";

export const runtime = "nodejs";

/** @deprecated 미니언 1명 고정 — 호환용 no-op */
export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const minionId = await resolveSoloMinionId(prisma, auth.userId);
    return Response.json({ ok: true as const, representativeMinionId: minionId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
