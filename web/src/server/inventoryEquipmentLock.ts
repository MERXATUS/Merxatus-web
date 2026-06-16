import type { Prisma } from "@prisma/client";

type EquipKind = "weapon" | "armor";

export function assertEquipmentNotUserLocked(inst: { userLocked?: boolean | null }) {
  if (inst.userLocked) throw new Error("ITEM_USER_LOCKED");
}

export async function setEquipmentUserLocked(
  tx: Pick<Prisma.TransactionClient, "weaponInstance" | "armorInstance" | "minion">,
  input: { userId: string; kind: EquipKind; instanceId: string; locked: boolean },
) {
  if (input.kind === "weapon") {
    const w = await tx.weaponInstance.findUnique({
      where: { id: input.instanceId },
      include: { listing: { select: { id: true } } },
    });
    if (!w || w.userId !== input.userId) throw new Error("NOT_FOUND");
    if (w.status !== "OWNED" || w.listing) throw new Error("EQUIPMENT_LOCKED");
    await tx.weaponInstance.update({
      where: { id: input.instanceId },
      data: { userLocked: input.locked },
    });
    return { ok: true as const, kind: "weapon" as const, instanceId: input.instanceId, locked: input.locked };
  }

  const a = await tx.armorInstance.findUnique({ where: { id: input.instanceId } });
  if (!a || a.userId !== input.userId) throw new Error("NOT_FOUND");
  if (a.status !== "OWNED") throw new Error("EQUIPMENT_LOCKED");
  await tx.armorInstance.update({
    where: { id: input.instanceId },
    data: { userLocked: input.locked },
  });
  return { ok: true as const, kind: "armor" as const, instanceId: input.instanceId, locked: input.locked };
}
