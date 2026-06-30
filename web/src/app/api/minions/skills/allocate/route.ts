import { z } from "zod";
import { requireUserId } from "@/server/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).optional(),
  minionId: z.string().min(1),
  skills: z.record(z.string(), z.number().int().min(0)),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: 401 });

  return Response.json({ ok: false, error: "SKILLS_DISABLED" }, { status: 400 });
}
