import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { sellEquipmentToShopTransaction } from "@/server/equipmentShop";

export const runtime = "nodejs";

const TargetSchema = z.object({
  kind: z.enum(["weapon", "armor"]),
  instanceId: z.string().min(1),
});

const BodySchema = z
  .object({
    userId: z.string().min(1).optional(),
    kind: z.enum(["weapon", "armor"]).optional(),
    instanceId: z.string().min(1).optional(),
    targets: z.array(TargetSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const hasSingle = data.kind != null && data.instanceId != null;
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
    const targets = parsed.data.targets?.length
      ? parsed.data.targets
      : [{ kind: parsed.data.kind!, instanceId: parsed.data.instanceId! }];

    const result = await sellEquipmentToShopTransaction({
      userId: auth.userId,
      targets,
    });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
