import { z } from "zod";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1),
  nickname: z.string().max(64).nullable(),
});

/** @deprecated 캐릭터 별칭 제거 — 설정에서 계정 이름 변경 */
export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  return Response.json(
    { ok: false, error: "USE_ACCOUNT_USERNAME" },
    { status: 400 },
  );
}
