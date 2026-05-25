import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { tryTutorialGatherVisit } from "@/server/tutorialProgress";
import { GATHER_TUTORIAL_WORKSHOPS } from "@/shared/tutorial";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopName: z.enum(GATHER_TUTORIAL_WORKSHOPS),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await tryTutorialGatherVisit(prisma, auth.userId, parsed.data.workshopName);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
