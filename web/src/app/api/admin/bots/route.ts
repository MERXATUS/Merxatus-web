import { requireAdmin } from "@/server/adminAuth";
import { getBotAdminDashboard } from "@/server/botAdminStats";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.error === "UNAUTHORIZED" ? 401 : 500 });
  }

  try {
    const data = await getBotAdminDashboard();
    return Response.json(data);
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
