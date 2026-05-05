import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { GAME_RULES } from "@/server/gameRules";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { ensureWorkshopsForUser } from "@/server/ensureWorkshopsForUser";
import { installWorkshopOnPlot } from "@/server/workshopPlot";

export const runtime = "nodejs";

const maxSlotIdx = Math.max(0, GAME_RULES.plot.maxSlots - 1);

const BodySchema = z.object({
  // coerce를 쓰면 null/"" 등이 0으로 변환될 수 있어 (2번칸 선택→1번칸 설치 같은) 버그가 생김
  plotSlot: z.number().int().min(0).max(maxSlotIdx),
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

    const r = await installWorkshopOnPlot({
      userId: auth.userId,
      plotSlot: parsed.data.plotSlot,
      workshopTypeId: parsed.data.workshopTypeId,
    });
    if (!r.ok) {
      const status =
        r.error === "SLOT_OCCUPIED"
          ? 409
          : r.error === "PLOT_FULL"
            ? 400
            : r.error === "WORKSHOP_TYPE_NOT_FOUND"
              ? 404
              : r.error === "PLOT_LOCKED"
                ? 403
                : r.error === "USER_NOT_FOUND"
                  ? 404
                  : r.error === "INSUFFICIENT_GOLD"
                    ? 400
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
