import { requireAdmin } from "@/server/adminAuth";
import { readRecipesJson, writeRecipesJson } from "@/server/adminData";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const r = await readRecipesJson();
    return Response.json({ ok: true, path: r.path, recipes: r.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const json = await req.json().catch(() => null);
  try {
    const r = await writeRecipesJson(json);
    return Response.json({ ok: true, path: r.path, recipes: r.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

