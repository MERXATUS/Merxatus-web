"use client";

import type { EquippedByMinionView } from "@/shared/equipmentEquippedBy";

type Props = {
  equippedByMinion?: EquippedByMinionView | null;
  /** @deprecated 단일 캐릭터 — 표시는 항상 「착용 중」 */
  compact?: boolean;
  className?: string;
};

export function ForgeEquippedByTag({ equippedByMinion, className }: Props) {
  if (!equippedByMinion) return null;
  return (
    <span
      className={["forge-equipped-by-tag", className ?? ""].filter(Boolean).join(" ")}
      title="착용 중"
    >
      착용 중
    </span>
  );
}
