import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUserId } from "@/server/auth";
import { canMinionEquipWeaponForClass } from "@/shared/minionWeaponRules";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";

export const runtime = "nodejs";

const BodySchema = z.object({
  minionId: z.string().min(1),
  weaponInstanceId: z.string().min(1).nullable(), // null = unequip
  userId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

  const auth = requireUserId(req, parsed.data.userId ?? null);
  if (!auth.ok)
    return Response.json({ ok: false, error: auth.error }, { status: 401 });

  const { minionId, weaponInstanceId } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.minion.findUnique({ where: { id: minionId } });
      if (!m) throw new Error("MINION_NOT_FOUND");
      if (m.userId !== auth.userId) throw new Error("FORBIDDEN");

      if (weaponInstanceId == null) {
        const updated = await tx.minion.update({
          where: { id: m.id },
          data: { equippedWeaponInstanceId: null },
        });
        return { ok: true as const, equippedWeaponInstanceId: updated.equippedWeaponInstanceId };
      }

      const inst = await tx.weaponInstance.findUnique({ where: { id: weaponInstanceId }, include: { baseItem: true } });
      if (!inst) throw new Error("WEAPON_INSTANCE_NOT_FOUND");
      if (inst.userId !== auth.userId) throw new Error("WEAPON_NOT_OWNED");
      if (inst.baseItem.category !== "무기" && !inst.baseItemId.toLowerCase().startsWith("weapon_")) {
        throw new Error("NOT_A_WEAPON");
      }
      if (inst.status !== "OWNED") throw new Error("WEAPON_LOCKED");
      const combatClass = resolveMinionCombatClass(promotionStateFromRow(m));
      if (!canMinionEquipWeaponForClass(combatClass, inst.baseItemId)) throw new Error("WEAPON_JOB_MISMATCH");

      const same = m.equippedWeaponInstanceId === weaponInstanceId;
      const updated = await tx.minion.update({
        where: { id: m.id },
        data: { equippedWeaponInstanceId: weaponInstanceId, ...(same ? {} : {}) },
      });
      return { ok: true as const, equippedWeaponInstanceId: updated.equippedWeaponInstanceId };
    });

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

