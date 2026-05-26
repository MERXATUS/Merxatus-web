import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { runProcessCraft } from "@/server/crafting";
import { buildCraftValueHints } from "@/server/craftValueHints";
import { prisma } from "@/server/db";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { tryTutorialFirstCraft } from "@/server/tutorialProgress";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  recipeId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await runProcessCraft({
      userId: auth.userId,
      workshopId: parsed.data.workshopId,
      recipeId: parsed.data.recipeId,
      quantity: parsed.data.quantity,
    });
    const valueHints = await buildCraftValueHints({
      recipeId: result.recipeId,
      quantity: result.quantity,
      produced: result.produced,
      craftedInstances: result.craftedInstances,
    });
    const tutorial = await tryTutorialFirstCraft(prisma, auth.userId);
    return Response.json({ ...result, valueHints, tutorialAdvanced: tutorial.advanced });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
