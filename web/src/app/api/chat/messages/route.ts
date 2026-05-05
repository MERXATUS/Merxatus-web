import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const QuerySchema = z.object({
  channel: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  userId: z.string().min(1).optional(),
});

/** 채팅 목록 (최신순으로 가져와 시간순으로 반환). 로그인 필요. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    channel: url.searchParams.get("channel") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const channel = parsed.data.channel ?? "world";
  const max = GAME_RULES.chat.maxFetchLimit;
  const def = GAME_RULES.chat.defaultFetchLimit;
  const limit = Math.min(max, Math.max(1, parsed.data.limit ?? def));

  const chat = prisma.chatMessage;
  if (!chat || typeof chat.findMany !== "function") {
    console.error("[chat/messages] prisma.chatMessage missing — run: npx prisma generate && restart dev server");
    return Response.json({ ok: false, error: "CHAT_BACKEND_UNAVAILABLE" }, { status: 503 });
  }

  const rows = await chat.findMany({
    where: { channel },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { username: true } } },
  });

  const chronological = rows.slice().reverse();

  return Response.json({
    ok: true,
    channel,
    messages: chronological.map((m) => ({
      id: m.id,
      userId: m.userId,
      username: m.user?.username ?? "?",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
