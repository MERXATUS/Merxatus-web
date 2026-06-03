import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { cancelFriendRequest } from "@/server/friends";

export const runtime = "nodejs";

const BodySchema = z.object({
  requestId: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  try {
    const r = await cancelFriendRequest({ userId: auth.userId, requestId: parsed.data.requestId });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL";
    const status =
      msg === "FRIEND_REQUEST_NOT_FOUND" || msg === "FRIEND_REQUEST_NOT_PENDING" ? 400 : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}
