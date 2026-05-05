import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { upgradeCostForLevel } from "@/server/minionUpgradeRules";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  minionId: z.string().min(1),
  // One trait line grows with each level-up (pick type here).
  traitType: z.enum(["MINER", "LUMBER", "FARMER", "FISHER", "FIGHTER"]),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const minion = await tx.minion.findUnique({ where: { id: parsed.data.minionId } });
      if (!minion) throw new Error("MINION_NOT_FOUND");
      if (minion.userId !== auth.userId) throw new Error("FORBIDDEN");

      const curLevel = Math.max(1, Math.floor(minion.level ?? 1));
      if (curLevel >= GAME_RULES.minion.maxLevel) throw new Error("MAX_MINION_LEVEL");
      const cost = upgradeCostForLevel(curLevel);

      const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (wallet.goldAvailable < cost.gold) throw new Error("INSUFFICIENT_GOLD");

      // Material availability
      for (const m of cost.materials) {
        const st = await tx.inventoryStack.findUnique({
          where: { userId_itemId: { userId: auth.userId, itemId: m.itemId } },
        });
        const have = st?.quantity ?? 0;
        if (have < m.quantity) throw new Error(`INSUFFICIENT_MATERIAL:${m.itemId}`);
      }

      // Deduct gold and materials
      await tx.wallet.update({
        where: { userId: auth.userId },
        data: { goldAvailable: { decrement: cost.gold } },
      });
      for (const m of cost.materials) {
        await tx.inventoryStack.update({
          where: { userId_itemId: { userId: auth.userId, itemId: m.itemId } },
          data: { quantity: { decrement: m.quantity } },
        });
      }

      // Level up
      const updated = await tx.minion.update({
        where: { id: minion.id },
        data: { level: curLevel + 1 },
      });

      // Trait: create rank=1 or increment rank
      const trait = await tx.minionTrait.upsert({
        where: { minionId_type: { minionId: minion.id, type: parsed.data.traitType } },
        create: { minionId: minion.id, type: parsed.data.traitType, rank: 1, xp: 0 },
        update: { rank: { increment: 1 } },
      });

      return {
        ok: true as const,
        minionId: updated.id,
        fromLevel: curLevel,
        toLevel: curLevel + 1,
        cost,
        trait: { type: trait.type, rank: trait.rank },
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

