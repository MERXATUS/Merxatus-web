import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { scheduleInventoryHygiene } from "@/server/inventoryHygiene";
import { buildMeState, type MeStateScope } from "@/server/meState";
import { needsDbMigration } from "@/server/apiRouteError";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  scope: z.enum(["inventory", "weapons", "armor", "market", "full"]).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      userId: url.searchParams.get("userId") ?? undefined,
      scope: url.searchParams.get("scope") ?? undefined,
    });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    scheduleInventoryHygiene(prisma, auth.userId);

    const scope = (parsed.data.scope ?? "full") as MeStateScope;
    return Response.json(await buildMeState(auth.userId, scope));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (needsDbMigration(msg)) {
      return Response.json(
        { ok: false, error: "DB_MIGRATION_REQUIRED", message: "DB 마이그레이션이 필요합니다." },
        { status: 503 },
      );
    }
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR", message: msg }, { status: 500 });
  }
}
