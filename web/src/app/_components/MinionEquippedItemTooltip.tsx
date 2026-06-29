"use client";

import type { ReactNode } from "react";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import type { ArmorTooltipData } from "@/shared/armorTooltip";
import type { MinionEquipSlotId, MinionEquippedItemView } from "@/shared/minionEquipSlots";
import type { StackItemTooltipData } from "@/shared/stackItemTooltip";
import type { WeaponTooltipData } from "@/shared/weaponTooltip";

export function MinionEquippedItemTooltip(props: {
  item: MinionEquippedItemView;
  slotId: MinionEquipSlotId;
  children: ReactNode;
}) {
  const { item, slotId, children } = props;
  const isWeapon = item.equipKind === "weapon" || slotId === "weapon";

  if (isWeapon) {
    const weapon: WeaponTooltipData = {
      id: item.instanceId ?? item.baseItemId,
      baseItemId: item.baseItemId,
      name: item.name,
      enhanceLevel: item.enhanceLevel ?? 0,
      quality: item.quality,
      qualityCraftCount: item.qualityCraftCount,
      itemLevel: item.itemLevel,
      grade: item.grade,
      gradeLabel: item.gradeLabel,
      identified: item.identified,
      options: item.options,
    };
    return <WeaponTooltipHover weapon={weapon}>{children}</WeaponTooltipHover>;
  }

  if (item.equipKind === "armor" || item.instanceId) {
    const armor: ArmorTooltipData = {
      id: item.instanceId ?? item.baseItemId,
      baseItemId: item.baseItemId,
      name: item.name,
      enhanceLevel: item.enhanceLevel ?? 0,
      quality: item.quality,
      qualityCraftCount: item.qualityCraftCount,
      itemLevel: item.itemLevel,
      grade: item.grade,
      gradeLabel: item.gradeLabel,
      identified: item.identified,
      options: item.options,
    };
    return <ArmorTooltipHover armor={armor}>{children}</ArmorTooltipHover>;
  }

  const stack: StackItemTooltipData = {
    itemId: item.baseItemId,
    name: item.name,
    category: "방어구",
    grade: item.grade,
    gradeLabel: item.gradeLabel,
  };
  return <StackItemTooltipHover item={stack}>{children}</StackItemTooltipHover>;
}
