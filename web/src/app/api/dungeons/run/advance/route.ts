import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { advanceOrStartPushLuckFloor } from "@/server/dungeonRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  /** 활성 런이 없을 때 필수 — 런 생성 후 1층 전투까지 한 번에 처리 */
  dungeonId: z.string().min(1).optional(),
  minionIds: z.array(z.string().min(1)).min(1).max(10).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json ?? {});
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const out = await advanceOrStartPushLuckFloor({
      userId: auth.userId,
      dungeonId: parsed.data.dungeonId,
      minionIds: parsed.data.minionIds,
    });
    return Response.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "NO_ACTIVE_RUN" ||
      message === "MINION_NOT_FOUND" ||
      message === "PARTY_TOO_LARGE" ||
      message === "NOT_PUSH_LUCK_DUNGEON" ||
      message === "AUTO_EXPLORE_ACTIVE"
        ? 400
        : message === "DUNGEON_NOT_FOUND"
          ? 404
          : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
