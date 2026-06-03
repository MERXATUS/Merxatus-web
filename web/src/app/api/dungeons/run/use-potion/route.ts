import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { usePotionOnActiveRun } from "@/server/dungeonRun";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  minionId: z.string().min(1),
});

/** 던전 탐험 중 층간 HP 회복 물약 사용 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const out = await usePotionOnActiveRun({
      userId: auth.userId,
      itemId: parsed.data.itemId,
      minionId: parsed.data.minionId,
    });
    return Response.json(out);
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const known = [
      "NO_ACTIVE_RUN",
      "NOT_PUSH_LUCK_DUNGEON",
      "INVALID_POTION",
      "NO_POTION",
      "MINION_NOT_IN_PARTY",
      "MINION_DEAD",
      "MINION_FULL_HP",
      "BAD_REQUEST",
    ];
    const status = known.includes(message) ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
