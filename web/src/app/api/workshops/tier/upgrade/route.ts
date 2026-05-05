import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

function upgradeCost(fromTier: number) {
  const map = GAME_RULES.workshop.tierUpgradeGoldByFromTier as Record<string, number>;
  const key = String(fromTier);
  const v = map[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const ws = await tx.workshopInstance.findUnique({
        where: { id: parsed.data.workshopId },
        include: { workshopType: true },
      });
      if (!ws) throw new Error("WORKSHOP_NOT_FOUND");
      if (ws.userId !== auth.userId) throw new Error("FORBIDDEN");
      if (ws.workshopType.kind !== "GATHER" && ws.workshopType.kind !== "PROCESS") {
        throw new Error("TIER_UPGRADE_NOT_ALLOWED");
      }

      const from = Math.max(1, Math.min(5, Math.floor(ws.tier ?? 1)));
      if (from >= 5) throw new Error("ALREADY_MAX_TIER");

      const cost = upgradeCost(from);
      if (!cost || cost <= 0) throw new Error("UPGRADE_COST_MISSING");

      const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet || wallet.goldAvailable < cost) throw new Error("INSUFFICIENT_GOLD");

      await tx.wallet.update({
        where: { userId: auth.userId },
        data: { goldAvailable: { decrement: cost } },
      });

      const updated = await tx.workshopInstance.update({
        where: { id: ws.id },
        data: { tier: from + 1 },
      });

      return { ok: true as const, fromTier: from, toTier: from + 1, costGold: cost, workshopId: updated.id };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
