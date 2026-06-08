import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

/** @deprecated `POST /api/minions/create/candidates` 사용 */
export async function POST(req: Request) {
  const auth = requireUserId(req, null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  return Response.json(
    {
      ok: false,
      error: "MINION_CREATE_MIGRATED",
      message: "미니언 관리에서 캐릭터를 생성해 주세요.",
    },
    { status: 400 },
  );
}
