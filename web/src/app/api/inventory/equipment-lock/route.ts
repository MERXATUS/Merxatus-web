import { z } from "zod";

import { requireUserId } from "@/server/auth";
import { prisma } from "@/server/db";
import { setEquipmentUserLocked } from "@/server/inventoryEquipmentLock";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  kind: z.enum(["weapon", "armor"]),
  instanceId: z.string().min(1),
  locked: z.boolean(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) =>
      setEquipmentUserLocked(tx, {
        userId: auth.userId,
        kind: parsed.data.kind,
        instanceId: parsed.data.instanceId,
        locked: parsed.data.locked,
      }),
    );
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status =
      message === "NOT_FOUND" || message === "EQUIPMENT_LOCKED" || message === "BAD_REQUEST" ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
