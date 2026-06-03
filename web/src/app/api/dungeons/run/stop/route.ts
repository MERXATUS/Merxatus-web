import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { enrichLootEntries, safeParsePendingLoot } from "@/server/dungeonRun";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const run = await prisma.dungeonRun.findFirst({
    where: { userId: auth.userId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return Response.json({ ok: false, error: "NO_ACTIVE_RUN" }, { status: 400 });

  const pending = safeParsePendingLoot(run.pendingLootJson ?? "[]");
  const forfeitedLoot = await enrichLootEntries(prisma, pending);

  await prisma.dungeonRun.update({
    where: { id: run.id },
    data: { status: "STOPPED", pendingLootJson: "[]" },
  });

  return Response.json({ ok: true, forfeitedLoot });
}
