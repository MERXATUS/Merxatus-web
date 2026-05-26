import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { completeProcessCraft } from "@/server/crafting";
import { buildCraftValueHints } from "@/server/craftValueHints";
import { prisma } from "@/server/db";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { tryTutorialFirstCraft } from "@/server/tutorialProgress";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  userId: z.string().min(1).optional(),
  forceReady: z.boolean().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await completeProcessCraft({
      userId: auth.userId,
      workshopId: parsed.data.workshopId,
      forceReady: parsed.data.forceReady,
    });
    const valueHints = await buildCraftValueHints({
      recipeId: result.recipeId,
      quantity: result.quantity,
      produced: result.produced,
      craftedInstances: result.craftedInstances,
    });
    const tutorial = parsed.data.forceReady
      ? { advanced: false as const }
      : await tryTutorialFirstCraft(prisma, auth.userId);
    return Response.json({ ...result, valueHints, tutorialAdvanced: tutorial.advanced });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    if (message.startsWith("CRAFT_NOT_READY:")) {
      const remainingMs = Number(message.split(":")[1] ?? 0);
      return Response.json(
        { ok: false, error: "CRAFT_NOT_READY", remainingMs: Number.isFinite(remainingMs) ? remainingMs : 0 },
        { status: 400 },
      );
    }
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
