import { z } from "zod";
import { requireAdmin } from "@/server/adminAuth";
import { getConfiguredBotCount } from "@/server/botRuntimeConfig";
import { ensureBotUsers } from "@/server/ensureBotUsers";

export const runtime = "nodejs";

const BodySchema = z.object({
  count: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "UNAUTHORIZED" ? 401 : 500 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "BAD_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const count = parsed.data.count ?? getConfiguredBotCount();
    const result = await ensureBotUsers(count);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
