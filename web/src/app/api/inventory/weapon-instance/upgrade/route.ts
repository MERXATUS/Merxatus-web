import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { weaponUpgradeCostForNextLevel } from "@/server/weaponUpgradeRules";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  weaponInstanceId: z.string().min(1),
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
      const inst = await tx.weaponInstance.findUnique({
        where: { id: parsed.data.weaponInstanceId },
        include: { baseItem: true },
      });
      if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (inst.userId !== auth.userId) throw new Error("FORBIDDEN");
      if (inst.baseItem.category !== "무기") throw new Error("NOT_A_WEAPON");
      if (inst.status !== "OWNED") throw new Error("WEAPON_LOCKED");

      const cur = Math.max(0, Math.floor(inst.enhanceLevel ?? 0));
      const max = Math.max(0, Math.floor(GAME_RULES.weaponUpgrade.maxLevel));
      if (cur >= max) throw new Error("MAX_WEAPON_LEVEL");

      const cost = weaponUpgradeCostForNextLevel(cur);

      const wallet = await tx.wallet.findUnique({ where: { userId: auth.userId } });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (wallet.goldAvailable < cost.gold) throw new Error("INSUFFICIENT_GOLD");

      for (const m of cost.materials) {
        const st = await tx.inventoryStack.findUnique({
          where: { userId_itemId: { userId: auth.userId, itemId: m.itemId } },
        });
        const have = st?.quantity ?? 0;
        if (have < m.quantity) throw new Error(`INSUFFICIENT_MATERIAL:${m.itemId}`);
      }

      await tx.wallet.update({ where: { userId: auth.userId }, data: { goldAvailable: { decrement: cost.gold } } });
      for (const m of cost.materials) {
        await tx.inventoryStack.update({
          where: { userId_itemId: { userId: auth.userId, itemId: m.itemId } },
          data: { quantity: { decrement: m.quantity } },
        });
      }

      const updated = await tx.weaponInstance.update({ where: { id: inst.id }, data: { enhanceLevel: cur + 1 } });
      return { ok: true as const, weaponInstanceId: updated.id, from: cur, to: updated.enhanceLevel, cost };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

