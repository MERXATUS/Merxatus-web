import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { sendFriendRequest } from "@/server/friends";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  try {
    const r = await sendFriendRequest({ userId: auth.userId, targetUsername: parsed.data.username });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const clientErrors = new Set([
      "FRIEND_USER_NOT_FOUND",
      "CANNOT_FRIEND_SELF",
      "ALREADY_FRIENDS",
      "REQUEST_ALREADY_SENT",
    ]);
    return Response.json({ ok: false, error: msg }, { status: clientErrors.has(msg) ? 400 : 500 });
  }
}
