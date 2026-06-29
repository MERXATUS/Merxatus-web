import { requireUserId } from "@/server/auth";
import { loadArmorCodexPayload } from "@/server/armorCodex";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const payload = await loadArmorCodexPayload(auth.userId);
    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    console.error("[api/codex/armor]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
