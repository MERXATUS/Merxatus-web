import { z } from "zod";
import { prisma } from "@/server/db";
import { collectWorkshop } from "@/server/workshops";
import { requireUserId } from "@/server/auth";
import { tryTutorialGatherCollect } from "@/server/tutorialProgress";
import { GATHER_TUTORIAL_WORKSHOPS } from "@/shared/tutorial";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await collectWorkshop({ workshopId: parsed.data.workshopId, userId: auth.userId });
    const ws = await prisma.workshopInstance.findUnique({
      where: { id: parsed.data.workshopId },
      include: { workshopType: { select: { name: true } } },
    });
    const wsName = ws?.workshopType?.name ?? "";
    let tutorialMinionGrants: Awaited<ReturnType<typeof tryTutorialGatherCollect>>["minionGrants"] = [];
    let tutorialAdvanced = false;
    if (GATHER_TUTORIAL_WORKSHOPS.includes(wsName as (typeof GATHER_TUTORIAL_WORKSHOPS)[number])) {
      const tut = await tryTutorialGatherCollect(prisma, auth.userId, wsName);
      tutorialMinionGrants = [...(tut.minionGrants ?? [])];
      tutorialAdvanced = tut.advanced;
    }

    return Response.json({ ...result, tutorialMinionGrants, tutorialAdvanced });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
