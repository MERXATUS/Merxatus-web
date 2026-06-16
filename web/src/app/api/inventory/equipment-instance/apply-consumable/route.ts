import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { applyEquipmentConsumable } from "@/server/equipmentConsumables";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  consumableItemId: z.string().min(1),
  targetKind: z.enum(["weapon", "armor"]),
  targetInstanceId: z.string().min(1),
  transferTargetInstanceId: z.string().min(1).optional(),
});

const ERROR_STATUS: Record<string, number> = {
  NOT_OPTION_CONSUMABLE: 400,
  NO_CONSUMABLE: 400,
  NOT_FOUND: 404,
  EQUIPMENT_LOCKED: 400,
  KIND_MISMATCH: 400,
  ALREADY_IDENTIFIED: 400,
  NEEDS_APPRAISAL: 400,
  NO_OPTIONS: 400,
  NO_REMOVABLE_OPTION: 400,
  SEAL_LIMIT_OR_NO_SLOT: 400,
  NO_EMPTY_SLOT: 400,
  NO_VOID_OPTION_POOL: 400,
  TRANSFER_NEEDS_SECOND_TARGET: 400,
  TRANSFER_SAME_INSTANCE: 400,
  TRANSFER_KIND_MISMATCH: 400,
  TRANSFER_GRADE_MISMATCH: 400,
  TRANSFER_ARMOR_SLOT_MISMATCH: 400,
  BAD_REQUEST: 400,
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const out = await applyEquipmentConsumable({
      userId: auth.userId,
      consumableItemId: parsed.data.consumableItemId,
      targetKind: parsed.data.targetKind,
      targetInstanceId: parsed.data.targetInstanceId,
      transferTargetInstanceId: parsed.data.transferTargetInstanceId,
    });
    return Response.json(out);
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    const status = ERROR_STATUS[message] ?? 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
