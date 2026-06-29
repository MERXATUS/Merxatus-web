import { prisma } from "@/server/db";
import { minionRoleLabel } from "@/server/minionJobs";
import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";
import { promotionStateFromRow, resolveMinionCombatClass } from "@/shared/minionPromotion";
import { minionDisplayName } from "@/shared/minionNickname";

function minionEquipLabel(row: {
  level: number;
  promotionTier: number;
  promotionClass: string;
  nickname?: string | null;
}): string {
  const combatClass = resolveMinionCombatClass(promotionStateFromRow(row));
  const classLabel = minionRoleLabel({ combatClass });
  return `${minionDisplayName(row.nickname, classLabel)} Lv${row.level}`;
}

export async function loadEquippedMinionByInstanceMaps(userId: string): Promise<{
  weaponByInstanceId: Map<string, EquippedByMinionView>;
  armorByInstanceId: Map<string, EquippedByMinionView>;
}> {
  const minions = await prisma.minion.findMany({
    where: { userId },
    select: {
      id: true,
      level: true,
      nickname: true,
      promotionTier: true,
      promotionClass: true,
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
    const ref: EquippedByMinionView = { id: m.id, label: minionEquipLabel(m) };
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
