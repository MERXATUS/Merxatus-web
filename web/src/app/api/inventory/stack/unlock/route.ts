import { z } from "zod";

import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { adjustStackLockQuantity } from "@/server/inventoryStackOps";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(999_999).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId: parsed.data.itemId } },
      });
      if (!stack) throw new Error("STACK_NOT_FOUND");
      const qty = parsed.data.quantity ?? stack.lockedQuantity;
      if (qty <= 0) throw new Error("NOTHING_LOCKED");
      return adjustStackLockQuantity(tx, auth.userId, parsed.data.itemId, -qty);
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "STACK_NOT_FOUND" ||
      message === "INSUFFICIENT_LOCKED" ||
      message === "NOTHING_LOCKED" ||
      message === "BAD_REQUEST"
        ? 400
        : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
