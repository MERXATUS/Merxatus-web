import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { MINION_EGG_ITEM_ID, randomMinionBirthRow } from "@/server/minionBirth";
import { createMinionWithBirth } from "@/server/minionInsert";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId: MINION_EGG_ITEM_ID } },
      });
      const qty = stack?.quantity ?? 0;
      if (qty < 1) throw new Error("NO_MINION_EGG");

      const maxOwned = GAME_RULES.minion.maxOwned;
      const currentCount = await tx.minion.count({ where: { userId: auth.userId } });
      if (currentCount >= maxOwned) throw new Error("MAX_MINION_OWNED");

      await tx.inventoryStack.update({
        where: { userId_itemId: { userId: auth.userId, itemId: MINION_EGG_ITEM_ID } },
        data: { quantity: { decrement: 1 } },
      });

      const birth = randomMinionBirthRow();
      const created = await createMinionWithBirth(tx, {
        userId: auth.userId,
        ...birth,
      });

      const total = await tx.minion.count({ where: { userId: auth.userId } });
      const capped = Math.min(total, GAME_RULES.minion.maxOwned);
      await tx.minionInventory.upsert({
        where: { userId: auth.userId },
        create: { userId: auth.userId, owned: capped },
        update: { owned: capped },
      });

      return {
        ok: true as const,
        minion: {
          id: created.id,
          level: created.level,
          grade: birth.grade,
          jobType: created.jobType,
        },
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
