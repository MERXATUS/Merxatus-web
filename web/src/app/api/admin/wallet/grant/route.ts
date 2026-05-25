import { z } from "zod";
import { requireAdmin } from "@/server/adminAuth";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

const DEFAULT_GRANT_GOLD = 100_000;

const BodySchema = z
  .object({
    username: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    amount: z.number().int().positive().optional(),
  })
  .refine((body) => Boolean(body.username?.trim() || body.userId?.trim()), {
    message: "USER_REQUIRED",
  });

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "UNAUTHORIZED" ? 401 : 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const amount = Math.max(1, Math.floor(parsed.data.amount ?? DEFAULT_GRANT_GOLD));
  const username = parsed.data.username?.trim();
  const userId = parsed.data.userId?.trim();

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findUnique({ where: { username: username! } });
  if (!user) {
    return Response.json({ ok: false, error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const wallet = await prisma.wallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, goldAvailable: amount, goldLocked: 0 },
    update: { goldAvailable: { increment: amount } },
  });

  return Response.json({
    ok: true,
    userId: user.id,
    username: user.username,
    added: amount,
    goldAvailable: wallet.goldAvailable,
  });
}
