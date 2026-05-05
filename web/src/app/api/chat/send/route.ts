import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { normalizeChatBody } from "@/server/chat";

export const runtime = "nodejs";

const BodySchema = z.object({
  channel: z.string().min(1).max(64).optional(),
  body: z.string(),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const norm = normalizeChatBody(parsed.data.body);
  if (!norm.ok) return Response.json({ ok: false, error: norm.error }, { status: 400 });

  const channel = parsed.data.channel ?? "world";

  const chat = prisma.chatMessage;
  if (!chat || typeof chat.create !== "function") {
    console.error("[chat/send] prisma.chatMessage missing — run: npx prisma generate && restart dev server");
    return Response.json(
      { ok: false, error: "CHAT_BACKEND_UNAVAILABLE" },
      { status: 503 },
    );
  }

  try {
    const msg = await chat.create({
      data: {
        channel,
        userId: auth.userId,
        body: norm.body,
      },
      include: { user: { select: { username: true } } },
    });

    return Response.json({
      ok: true,
      message: {
        id: msg.id,
        userId: msg.userId,
        username: msg.user?.username ?? "?",
        body: msg.body,
        createdAt: msg.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
