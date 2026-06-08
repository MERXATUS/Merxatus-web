import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { buildMeDashboardLight } from "@/server/meDashboard";
import { buildMeSummary } from "@/server/meSummary";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const [summary, dashboard] = await Promise.all([
      buildMeSummary(auth.userId),
      buildMeDashboardLight(auth.userId),
    ]);

    return Response.json({ ok: true as const, summary, dashboard });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[me/bootstrap]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
