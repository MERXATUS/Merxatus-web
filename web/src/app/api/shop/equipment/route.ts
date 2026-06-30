import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { listEquipmentShop } from "@/server/equipmentShop";

export const runtime = "nodejs";

const QuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const out = await listEquipmentShop(auth.userId);
    return Response.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/shop/equipment]", e);
    return Response.json({ ok: false, error: "INTERNAL", message: msg }, { status: 500 });
  }
}
