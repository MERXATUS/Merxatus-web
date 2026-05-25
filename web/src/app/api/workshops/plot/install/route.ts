import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { installWorkshopForUser } from "@/server/workshopPlot";

export const runtime = "nodejs";

const BodySchema = z.object({
  workshopTypeId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const auth = requireUserId(req, parsed.data.userId ?? null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    await ensureWorkshopsForUser(auth.userId);

    const r = await installWorkshopForUser({
      userId: auth.userId,
      workshopTypeId: parsed.data.workshopTypeId,
    });
    if (!r.ok) {
      const status =
        r.error === "PLOT_FULL"
          ? 400
          : r.error === "WORKSHOP_TYPE_NOT_FOUND"
            ? 404
            : r.error === "USER_NOT_FOUND"
              ? 404
              : 400;
      return Response.json({ ok: false, error: r.error }, { status });
    }

    return Response.json({ ok: true, workshopId: r.workshopId });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    throw e;
  }
}
