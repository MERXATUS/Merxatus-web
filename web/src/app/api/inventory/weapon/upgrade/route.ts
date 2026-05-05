import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { weaponUpgradeCostForNextLevel } from "@/server/weaponUpgradeRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  itemId: z.string().min(1), // weapon itemId
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const { itemId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) throw new Error("ITEM_NOT_FOUND");
      if (item.category !== "무기") throw new Error("NOT_A_WEAPON");

      const have = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId } },
      });
      if (!have || have.quantity <= 0) throw new Error("WEAPON_NOT_OWNED");

      const curRow = await tx.userItemEnhancement.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId } },
      });
      const cur = Math.max(0, Math.floor(curRow?.level ?? 0));
      const cost = weaponUpgradeCostForNextLevel(cur);

      const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (wallet.goldAvailable < cost.gold) throw new Error("INSUFFICIENT_GOLD");

      for (const m of cost.materials) {
        const st = await tx.inventoryStack.findUnique({
          where: { userId_itemId: { userId: auth.userId, itemId: m.itemId } },
        });
        const q = st?.quantity ?? 0;
        if (q < m.quantity) throw new Error(`INSUFFICIENT_MATERIAL:${m.itemId}`);
      }

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

      const updated = await tx.userItemEnhancement.upsert({
        where: { userId_itemId: { userId: auth.userId, itemId } },
        create: { userId: auth.userId, itemId, level: cur + 1 },
        update: { level: cur + 1 },
      });

      return { ok: true as const, itemId, from: cur, to: updated.level, cost };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

