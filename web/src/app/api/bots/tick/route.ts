import { requireAdminOrCron } from "@/server/adminAuth";
import { runMarketBotsTick } from "@/server/bots";

export const runtime = "nodejs";

async function handle(req: Request) {
  const auth = requireAdminOrCron(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "UNAUTHORIZED" ? 401 : 500 });
  }

  try {
    const result = await runMarketBotsTick();
    return Response.json(result);
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
