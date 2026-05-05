import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { removeWorkshopFromPlot } from "@/server/workshopPlot";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const r = await removeWorkshopFromPlot({
    userId: auth.userId,
    workshopId: parsed.data.workshopId,
  });
  if (!r.ok) return Response.json({ ok: false, error: r.error }, { status: 404 });

  return Response.json({ ok: true });
}
