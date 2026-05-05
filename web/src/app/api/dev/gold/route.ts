import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  amount: z.number().int().positive(),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const amount = Math.max(1, Math.floor(parsed.data.amount));

  const wallet = await prisma.wallet.upsert({
    where: { userId: auth.userId },
    create: { userId: auth.userId, goldAvailable: amount, goldLocked: 0 },
    update: { goldAvailable: { increment: amount } },
  });

  return Response.json({ ok: true, userId: auth.userId, added: amount, goldAvailable: wallet.goldAvailable });
}

