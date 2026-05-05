import { z } from "zod";
import { prisma } from "@/server/db";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { createSessionCookie } from "@/server/session";

export const runtime = "nodejs";

const BodySchema = z.object({
  username: z.string().min(1).max(32),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const username = parsed.data.username.trim();
  if (!username) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  try {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username },
      update: {},
    });

    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, goldAvailable: 1000, goldLocked: 0 },
      update: {},
    });

    await prisma.minionInventory.upsert({
      where: { userId: user.id },
      create: { userId: user.id, owned: 1 },
      update: {},
    });

    await ensureWorkshopsForUser(user.id);

    const cookie = createSessionCookie(user.id);
    return new Response(
      JSON.stringify({ ok: true, user: { id: user.id, username: user.username } }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": cookie,
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

