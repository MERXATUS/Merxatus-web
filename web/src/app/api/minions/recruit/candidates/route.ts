import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { rollRecruitCandidates } from "@/server/minionRecruit";
import { createRecruitPickToken } from "@/server/minionRecruitPickToken";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  category: z.enum(["GATHER", "DUNGEON"]).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const itemId = parsed.data.itemId.trim().toLowerCase();
  const category = parsed.data.category ?? "DUNGEON";

  try {
    const stack = await prisma.inventoryStack.findUnique({
      where: { userId_itemId: { userId: auth.userId, itemId } },
    });
    if ((stack?.quantity ?? 0) < 1) {
      return Response.json({ ok: false, error: "NO_RECRUIT_TICKET" }, { status: 400 });
    }

    const rolled = await rollRecruitCandidates(itemId, { category });
    const pickToken = createRecruitPickToken({
      userId: auth.userId,
      itemId,
      category: rolled.minionKind,
      candidates: rolled.candidates.map((c) => c.baseStats),
    });

    return Response.json({
      ok: true,
      minionKind: rolled.minionKind,
      ticketNameKo: rolled.ticket.nameKo,
      candidates: rolled.candidates,
      pickToken,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
