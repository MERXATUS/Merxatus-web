import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";
import { itemGradeLabel } from "@/server/itemGrade";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
  workshopId: z.string().min(1),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    userId: url.searchParams.get("userId") ?? undefined,
    workshopId: url.searchParams.get("workshopId"),
  });
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });
  const { workshopId } = parsed.data;
  const userId = auth.userId;

  const ws = await prisma.workshopInstance.findUnique({
    where: { id: workshopId },
    include: {
      workshopType: {
        include: {
          drops: {
            include: { item: true },
            orderBy: [{ weight: "desc" }],
          },
        },
      },
    },
  });
  if (!ws) return Response.json({ ok: false, error: "WORKSHOP_NOT_FOUND" }, { status: 404 });
  if (ws.userId !== userId) return Response.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const tier = Math.max(1, Math.min(5, Math.floor(ws.tier ?? 1)));
  const allDrops = ws.workshopType.drops;
  const drops =
    ws.workshopType.kind === "GATHER"
      ? allDrops.filter((d) => Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1))) <= tier)
      : allDrops;

  const toolId = ws.equippedToolItemId ?? null;
  const allowedMap = GAME_RULES.workshop.tool.allowedToolItemIdsByWorkshopName as Record<string, readonly string[]>;
  const allowed = allowedMap[ws.workshopType.name] ?? [];
  const toolActive = !!toolId && allowed.includes(toolId);
  const rareMult = GAME_RULES.workshop.tool.rareWeightMultiplier;

  const adjustedWeight = (w: number, minTier: number) => {
    const base = Math.max(0, w);
    if (!toolActive) return base;
    if (minTier < 2) return base;
    return Math.round(base * rareMult);
  };

  const rows = drops.map((d) => {
    const minTier = Math.max(1, Math.min(5, Math.floor(d.minTier ?? 1)));
    return { d, minTier, weightAdj: adjustedWeight(d.weight, minTier) };
  });
  const total = rows.reduce((a, r) => a + r.weightAdj, 0);

  return Response.json({
    ok: true,
    workshopType: { id: ws.workshopType.id, name: ws.workshopType.name, kind: ws.workshopType.kind },
    tier,
    tool: { equippedToolItemId: toolId, active: toolActive, rareWeightMultiplier: rareMult },
    drops: rows.map(({ d, minTier, weightAdj }) => ({
      itemId: d.itemId,
      itemName: d.item.name,
      category: d.item.category,
      grade: d.item.grade,
      gradeLabel: itemGradeLabel(d.item.grade),
      weight: d.weight,
      weightAdjusted: weightAdj,
      chance: total > 0 ? weightAdj / total : 0,
      minQty: d.minQty,
      maxQty: d.maxQty,
      minTier,
    })),
  });
}

