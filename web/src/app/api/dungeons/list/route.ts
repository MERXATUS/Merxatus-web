import { loadDungeons } from "@/server/dungeonData";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { dungeons } = await loadDungeons();
    return Response.json({ ok: true, dungeons });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

