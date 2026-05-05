import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const QuerySchema = z.object({
  workshopTypeId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    workshopTypeId: url.searchParams.get("workshopTypeId") ?? "",
    userId: url.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const ws = await prisma.workshopType.findUnique({ where: { id: parsed.data.workshopTypeId } });
  if (!ws) return Response.json({ ok: false, error: "WORKSHOP_TYPE_NOT_FOUND" }, { status: 404 });

  const recipes = await prisma.recipe.findMany({
    where: { workshopTypeId: ws.id },
    include: { inputs: true, outputs: true },
    orderBy: [{ name: "asc" }],
    take: 50,
  });

  return Response.json({
    ok: true,
    workshopTypeId: ws.id,
    workshopName: ws.name,
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      rewardGold: r.rewardGold,
      minTier: Math.max(1, Math.min(5, Math.floor(r.minTier ?? 1))),
      craftTimeSeconds: Math.max(1, Math.floor(r.craftTimeSeconds ?? 60)),
      inputs: r.inputs.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
      outputs: r.outputs.map((o) => ({
        itemId: o.itemId,
        weight: o.weight,
        minQty: o.minQty,
        maxQty: o.maxQty,
      })),
    })),
  });
}

