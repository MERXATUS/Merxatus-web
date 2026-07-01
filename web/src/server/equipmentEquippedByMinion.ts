import { prisma } from "@/server/db";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";

const EQUIPPED_LABEL = "착용 중";

export async function loadEquippedMinionByInstanceMaps(userId: string): Promise<{
  weaponByInstanceId: Map<string, EquippedByMinionView>;
  armorByInstanceId: Map<string, EquippedByMinionView>;
}> {
  const minions = await prisma.minion.findMany({
    where: { userId },
    select: {
      id: true,
      equippedWeaponInstanceId: true,
      equippedHelmetInstanceId: true,
      equippedChestInstanceId: true,
      equippedPantsInstanceId: true,
      equippedBootsInstanceId: true,
    },
  });

  const weaponByInstanceId = new Map<string, EquippedByMinionView>();
  const armorByInstanceId = new Map<string, EquippedByMinionView>();

  for (const m of minions) {
    const ref: EquippedByMinionView = { id: m.id, label: EQUIPPED_LABEL };
    if (m.equippedWeaponInstanceId) weaponByInstanceId.set(m.equippedWeaponInstanceId, ref);
    for (const instId of [
      m.equippedHelmetInstanceId,
      m.equippedChestInstanceId,
      m.equippedPantsInstanceId,
      m.equippedBootsInstanceId,
    ]) {
      if (instId) armorByInstanceId.set(instId, ref);
    }
  }

  return { weaponByInstanceId, armorByInstanceId };
}
