import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  itemId: z.string().min(1).nullable(), // null = unequip
  userId: z.string().min(1).optional(),
});

function isAllowedTool(workshopName: string, itemId: string) {
  const map = GAME_RULES.workshop.tool.allowedToolItemIdsByWorkshopName as Record<string, readonly string[]>;
  const allowed = map[workshopName] ?? [];
  return allowed.includes(itemId);
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const { workshopId, itemId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const ws = await tx.workshopInstance.findUnique({
        where: { id: workshopId },
        include: { workshopType: true },
      });
      if (!ws) throw new Error("WORKSHOP_NOT_FOUND");
      if (ws.userId !== auth.userId) throw new Error("FORBIDDEN");

      if (itemId == null) {
        const updated = await tx.workshopInstance.update({
          where: { id: ws.id },
          data: { equippedToolItemId: null },
        });
        return { ok: true as const, equippedToolItemId: updated.equippedToolItemId };
      }

      if (!isAllowedTool(ws.workshopType.name, itemId)) throw new Error("TOOL_NOT_ALLOWED_FOR_WORKSHOP");

      const stack = await tx.inventoryStack.findUnique({
        where: { userId_itemId: { userId: auth.userId, itemId } },
      });
      if (!stack || stack.quantity <= 0) throw new Error("TOOL_NOT_OWNED");

      const updated = await tx.workshopInstance.update({
        where: { id: ws.id },
        data: { equippedToolItemId: itemId },
      });
      return { ok: true as const, equippedToolItemId: updated.equippedToolItemId };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

