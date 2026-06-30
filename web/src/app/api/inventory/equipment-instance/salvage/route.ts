import { z } from "zod";
import { runPrismaTransaction } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { attemptBatchEquipmentSalvage, attemptEquipmentSalvage } from "@/server/equipmentSalvage";
export const runtime = "nodejs";

const TargetSchema = z.object({
  targetKind: z.enum(["weapon", "armor"]),
  targetInstanceId: z.string().min(1),
});

const BodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    targetKind: z.enum(["weapon", "armor"]).optional(),
    targetInstanceId: z.string().min(1).optional(),
    targets: z.array(TargetSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const hasSingle = data.targetKind != null && data.targetInstanceId != null;
    const hasBatch = (data.targets?.length ?? 0) > 0;
    if (hasSingle === hasBatch) {
      ctx.addIssue({
        code: "custom",
        message: "single or batch targets required",
        path: ["targets"],
      });
    }
  });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    if (parsed.data.targets?.length) {
      const result = await runPrismaTransaction(async (tx) =>
        attemptBatchEquipmentSalvage(tx, {
          userId: auth.userId,
          targets: parsed.data.targets!.map((t) => ({
            kind: t.targetKind,
            instanceId: t.targetInstanceId,
          })),
        }),
      );
      return Response.json(result);
    }

    const result = await runPrismaTransaction(async (tx) =>
      attemptEquipmentSalvage(tx, {
        userId: auth.userId,
        kind: parsed.data.targetKind!,
        instanceId: parsed.data.targetInstanceId!,
      }),
    );
    return Response.json(result);
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
