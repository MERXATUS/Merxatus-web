import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { removeFriend } from "@/server/friends";

export const runtime = "nodejs";

const BodySchema = z.object({
  friendUserId: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  try {
    const r = await removeFriend({ userId: auth.userId, friendUserId: parsed.data.friendUserId });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    return Response.json({ ok: false, error: msg }, { status: msg === "NOT_FRIENDS" ? 400 : 500 });
  }
}
