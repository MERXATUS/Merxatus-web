"use client";

import { ForgeToolPicker, renderForgeOptionChips, type ForgeEquipTarget } from "@/app/_components/ForgeToolPicker";
import { FORGE_OPTION_TOOLS } from "@/shared/forgeWorkbench";

export type SelectedEquipTarget = ForgeEquipTarget;

/** 인벤 등 임베드용 — 강화소와 동일 레지스트리 */
export function EquipmentConsumableBar(props: {
  inventory: Array<{ itemId: string; name: string; quantity: number }>;
  selectedEquip: SelectedEquipTarget | null;
  selectedConsumableId: string | null;
  onSelectConsumable: (itemId: string | null) => void;
  onApply: () => void;
  busy: boolean;
  targetLabel: string | null;
}) {
  return (
    <ForgeToolPicker
      tools={FORGE_OPTION_TOOLS}
      inventory={props.inventory}
      selectedToolId={props.selectedConsumableId}
      onSelectTool={props.onSelectConsumable}
      selectedEquip={props.selectedEquip}
      targetLabel={props.targetLabel}
      onApply={props.onApply}
      busy={props.busy}
      compact
    />
  );
}

export function renderEquipOptionChips(
  options: Array<{
    kind: string;
    label: string;
    tierLabel: string;
    displayValue: number;
    isPercent?: boolean;
    flatBonus?: number;
    hidden?: boolean;
    locked?: boolean;
  }>,
  tone: "weapon" | "armor",
) {
  return renderForgeOptionChips(options, tone);
}
