import { requireUserId } from "@/server/auth";
import { loadWeaponCodexPayload } from "@/server/weaponCodex";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const payload = await loadWeaponCodexPayload(auth.userId);
    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    console.error("[api/codex/weapons]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
