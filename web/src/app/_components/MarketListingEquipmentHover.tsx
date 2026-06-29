"use client";

import type { ReactNode } from "react";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import type { ArmorTooltipData } from "@/shared/armorTooltip";
import type { WeaponTooltipData } from "@/shared/weaponTooltip";

export type MarketListingEquipmentView = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade: number;
  gradeLabel: string;
  identified: boolean;
  options: WeaponTooltipData["options"];
};

function toWeaponTooltipData(row: MarketListingEquipmentView): WeaponTooltipData {
  return {
    id: row.id,
    baseItemId: row.baseItemId,
    name: row.name,
    enhanceLevel: row.enhanceLevel,
    grade: row.grade,
    gradeLabel: row.gradeLabel,
    identified: row.identified,
    options: row.options,
  };
}

function toArmorTooltipData(row: MarketListingEquipmentView): ArmorTooltipData {
  return {
    id: row.id,
    baseItemId: row.baseItemId,
    name: row.name,
    enhanceLevel: row.enhanceLevel,
    grade: row.grade,
    gradeLabel: row.gradeLabel,
    identified: row.identified,
    options: row.options,
  };
}

export function MarketListingEquipmentHover(props: {
  weapon?: MarketListingEquipmentView | null;
  armor?: MarketListingEquipmentView | null;
  children: ReactNode;
}) {
  const { weapon, armor, children } = props;
  if (weapon) {
    return <WeaponTooltipHover weapon={toWeaponTooltipData(weapon)}>{children}</WeaponTooltipHover>;
  }
  if (armor) {
    return <ArmorTooltipHover armor={toArmorTooltipData(armor)}>{children}</ArmorTooltipHover>;
  }
  return <>{children}</>;
}
