import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { tryTutorialVisitMarket } from "@/server/tutorialProgress";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireUserId(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await tryTutorialVisitMarket(prisma, auth.userId);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
