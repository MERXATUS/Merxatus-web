"use client";

import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";

type Props = {
  equippedByMinion?: EquippedByMinionView | null;
  /** 아이콘 셀용 — 텍스트 대신 우측 위 점만 표시 */
  compact?: boolean;
  className?: string;
};

export function ForgeEquippedByTag({ equippedByMinion, compact, className }: Props) {
  if (!equippedByMinion) return null;

  if (compact) {
    return (
      <span
        className={["forge-equipped-by-dot", className ?? ""].filter(Boolean).join(" ")}
        title="착용 중"
        aria-label="착용 중"
      />
    );
  }

  return (
    <span
      className={["forge-equipped-by-tag", className ?? ""].filter(Boolean).join(" ")}
      title="착용 중"
    >
      착용 중
    </span>
  );
}
