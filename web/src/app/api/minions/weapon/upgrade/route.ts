import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { attemptWeaponInstanceUpgrade } from "@/server/weaponInstanceUpgrade";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const minion = await tx.minion.findUnique({ where: { id: parsed.data.minionId } });
      if (!minion) throw new Error("MINION_NOT_FOUND");
      if (minion.userId !== auth.userId) throw new Error("FORBIDDEN");
      if (!minion.equippedWeaponInstanceId) throw new Error("NO_WEAPON_EQUIPPED");

      const out = await attemptWeaponInstanceUpgrade(tx, {
        userId: auth.userId,
        weaponInstanceId: minion.equippedWeaponInstanceId,
      });

      return {
        ...out,
        fromWeaponLevel: out.from,
        toWeaponLevel: out.to,
      };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
