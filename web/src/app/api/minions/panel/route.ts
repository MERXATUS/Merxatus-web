import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { loadMinionPanelPayload } from "@/server/minionPanelPayload";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  selectedId: z.string().min(1).optional(),
});

/** 미니언 관리 패널 — 목록 + 장비 가방을 1회 요청으로 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      userId: url.searchParams.get("userId") ?? undefined,
      selectedId: url.searchParams.get("selectedId") ?? undefined,
    });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const payload = await loadMinionPanelPayload(auth.userId, {
      detailMinionId: parsed.data.selectedId ?? null,
    });
    return Response.json({ ok: true, ...payload });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/minions/panel]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR", message }, { status: 500 });
  }
}
