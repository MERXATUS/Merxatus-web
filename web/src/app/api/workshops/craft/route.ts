import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { craftRecipe } from "@/server/crafting";

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
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await craftRecipe({
      userId: auth.userId,
      workshopId: parsed.data.workshopId,
      recipeId: parsed.data.recipeId,
      quantity: parsed.data.quantity,
    });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

