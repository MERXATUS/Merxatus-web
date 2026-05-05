import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { unlockNextPlotSlot } from "@/server/workshopPlot";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    await ensureWorkshopsForUser(auth.userId);

    const r = await unlockNextPlotSlot(auth.userId);
    if (!r.ok) {
      const status =
        r.error === "INSUFFICIENT_GOLD"
          ? 400
          : r.error === "PLOT_FULLY_UNLOCKED"
            ? 400
            : r.error === "USER_NOT_FOUND"
              ? 404
              : 400;
      return Response.json({ ok: false, error: r.error }, { status });
    }

    return Response.json({ ok: true, plotSlotsUnlocked: r.plotSlotsUnlocked });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
