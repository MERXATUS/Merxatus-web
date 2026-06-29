import { z } from "zod";
import { requireUserId } from "@/server/auth";
import { registerWeaponToCodex } from "@/server/weaponCodex";
import { prismaKnownErrorResponse } from "@/server/prismaHttp";

export const runtime = "nodejs";

const BodySchema = z.object({
  weaponInstanceId: z.string().min(1),
  milestoneId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const auth = requireUserId(req, null);
    if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

    const body = BodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const result = await registerWeaponToCodex(
      auth.userId,
      body.data.weaponInstanceId,
      body.data.milestoneId,
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const r = prismaKnownErrorResponse(e);
    if (r) return r;
    const code = e instanceof Error ? e.message : "INTERNAL_SERVER_ERROR";
    if (
      code === "NOT_FOUND" ||
      code === "FORBIDDEN" ||
      code === "EQUIPMENT_LOCKED" ||
      code === "EQUIPMENT_EQUIPPED" ||
      code === "WEAPON_CODEX_NOT_UPGRADE" ||
      code === "CODEX_MILESTONE_INVALID" ||
      code === "CODEX_MILESTONE_NOT_MET" ||
      code === "CODEX_MILESTONE_ALREADY"
    ) {
      return Response.json({ ok: false, error: code }, { status: 400 });
    }
    console.error("[api/codex/weapons/register]", e);
    return Response.json({ ok: false, error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
