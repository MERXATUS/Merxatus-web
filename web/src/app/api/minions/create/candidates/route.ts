import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { assertCanCreateMinion, rollMinionCreateCandidates } from "@/server/minionCreate";
import { createRecruitPickToken } from "@/server/minionRecruitPickToken";
import { MINION_CREATE_PICK_ITEM_ID } from "@/shared/minionCreate";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    await assertCanCreateMinion(prisma, auth.userId);
    const candidates = rollMinionCreateCandidates();
    const pickToken = createRecruitPickToken({
      userId: auth.userId,
      itemId: MINION_CREATE_PICK_ITEM_ID,
      category: "DUNGEON",
      candidates: candidates.map((c) => c.baseStats),
    });

    return Response.json({
      ok: true as const,
      candidates,
      pickToken,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
