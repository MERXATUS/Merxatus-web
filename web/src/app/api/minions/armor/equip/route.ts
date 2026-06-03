import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { equipMinionArmor } from "@/server/minionArmorEquip";
import { isArmorEquipSlot, type MinionEquipSlotId } from "@/shared/minionEquipSlots";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1),
  slotId: z.enum(["helmet", "armor", "pants", "shoes"]),
  itemId: z.string().min(1).nullable().optional(),
  armorInstanceId: z.string().min(1).nullable().optional(),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const { minionId, slotId, itemId = null, armorInstanceId = null } = parsed.data;
  if (!isArmorEquipSlot(slotId as MinionEquipSlotId)) {
    return Response.json({ ok: false, error: "INVALID_ARMOR_SLOT" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) =>
      equipMinionArmor({
        tx,
        userId: auth.userId,
        minionId,
        slotId: slotId as MinionEquipSlotId,
        itemId: itemId ?? null,
        armorInstanceId: armorInstanceId ?? null,
      }),
    );
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
