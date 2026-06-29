import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { minionRoleLabel } from "@/server/minionJobs";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import {
  minionDisplayName,
  normalizeMinionNicknameInput,
  validateMinionNickname,
} from "@/shared/minionNickname";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1),
  nickname: z.string().max(64).nullable(),
});

export async function POST(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const { minionId, nickname: rawNickname } = parsed.data;
    const minion = await prisma.minion.findFirst({
      where: { id: minionId, userId: auth.userId },
      select: {
        id: true,
        promotionTier: true,
        promotionClass: true,
      },
    });
    if (!minion) return Response.json({ ok: false, error: "MINION_NOT_FOUND" }, { status: 404 });

    let nickname: string | null = null;
    if (rawNickname != null) {
      const trimmed = normalizeMinionNicknameInput(rawNickname);
      if (trimmed) {
        const checked = validateMinionNickname(trimmed);
        if (!checked.ok) return Response.json({ ok: false, error: checked.code }, { status: 400 });
        nickname = checked.nickname;
      }
    }

    await prisma.minion.update({
      where: { id: minion.id },
      data: { nickname },
    });

    const combatClass = resolveMinionCombatClass(promotionStateFromRow(minion));
    const combatClassLabel = minionRoleLabel({ combatClass });

    return Response.json({
      ok: true as const,
      nickname,
      combatClassLabel,
      displayName: minionDisplayName(nickname, combatClassLabel),
    });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const message = e instanceof Error ? e.message : "UNKNOWN";
    console.error("[minions/nickname]", e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
