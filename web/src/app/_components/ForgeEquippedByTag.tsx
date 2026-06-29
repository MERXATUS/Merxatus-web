"use client";

import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";

type Props = {
  equippedByMinion?: EquippedByMinionView | null;
  /** 아이콘 셀용 짧은 라벨 */
  compact?: boolean;
  className?: string;
};

export function ForgeEquippedByTag({ equippedByMinion, compact, className }: Props) {
  if (!equippedByMinion) return null;
  const label = compact ? "착용" : `착용 · ${equippedByMinion.label}`;
  return (
    <span
      className={["forge-equipped-by-tag", compact ? "forge-equipped-by-tag--compact" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      title={`${equippedByMinion.label} 착용 중`}
    >
      {label}
    </span>
  );
}
