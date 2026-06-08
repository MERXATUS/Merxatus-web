import { requireUserId } from "@/server/auth";
import { appraiseAllUnidentifiedEquipment } from "@/server/equipmentConsumables";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const ERROR_STATUS: Record<string, number> = {
  NOTHING_TO_APPRAISE: 400,
  INSUFFICIENT_SCROLLS: 400,
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const userIdRaw = json && typeof json === "object" && "userId" in json ? (json as { userId?: string }).userId : null;
  const auth = requireUserId(req, userIdRaw ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const out = await appraiseAllUnidentifiedEquipment(auth.userId);
    return Response.json(out);
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status = ERROR_STATUS[message] ?? 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
