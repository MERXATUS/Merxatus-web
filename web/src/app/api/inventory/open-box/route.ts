import { z } from "zod";

import { requireUserId } from "@/server/auth";
import { openLootBoxInTx } from "@/server/boxOpen";
import { prisma } from "@/server/db";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) =>
      openLootBoxInTx(tx, {
        userId: auth.userId,
        boxItemId: parsed.data.itemId,
        quantity: parsed.data.quantity ?? 1,
      }),
    );
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "NOT_A_LOOT_BOX" ||
      message === "NO_BOX" ||
      message === "BOX_TABLE_EMPTY" ||
      message === "ITEM_LOCKED"
        ? 400
        : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
