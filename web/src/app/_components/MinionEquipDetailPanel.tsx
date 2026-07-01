"use client";

import { MinionEquipDoll } from "@/app/_components/MinionEquipDoll";
import { MinionStatPanel } from "@/app/_components/MinionStatPanel";
import { GameBtn } from "@/app/_components/gameUi";
import { slotToBagCategory } from "@/shared/minionEquipBag";
import type { MinionCombatBreakdown } from "@/shared/minionCombatStats";
import {
  MINION_EQUIP_SLOTS,
  type MinionEquipSlotId,
  type MinionEquipmentView,
} from "@/shared/minionEquipSlots";
import { useIsMobile } from "@/shared/useIsMobile";

function slotLabel(slotId: MinionEquipSlotId) {
  return MINION_EQUIP_SLOTS.find((s) => s.id === slotId)?.label ?? slotId;
}

export function MinionEquipDetailPanel(props: {
  minion: {
    level: number;
    combatClassLabel: string;
  };
  equipment: MinionEquipmentView;
  combatStats?: MinionCombatBreakdown | null;
  clickableSlots: MinionEquipSlotId[];
  activeSlot: MinionEquipSlotId;
  onSlotClick: (slotId: MinionEquipSlotId) => void;
  onSlotDrop: (slotId: MinionEquipSlotId, raw: string) => void;
  onSlotCategoryHint?: (category: ReturnType<typeof slotToBagCategory>) => void;
  onDone: () => void;
  busy: boolean;
  notice?: string | null;
  compact?: boolean;
}) {
  const {
    minion,
    equipment,
    combatStats,
    clickableSlots,
    activeSlot,
    onSlotClick,
    onSlotDrop,
    onDone,
    busy,
    notice,
    compact,
  } = props;
  const isMobile = useIsMobile();

  return (
    <div className={`minion-equip-detail-panel ${compact ? "minion-equip-detail-panel--compact" : ""}`}>
      <div className="minion-equip-detail-panel__head">
        <div>
          <h3 className="minion-equip-detail-panel__title">{minion.combatClassLabel}</h3>
          <p className="minion-equip-detail-panel__level">Lv{minion.level}</p>
        </div>
        <GameBtn variant="primary" disabled={busy} onClick={onDone}>
          완료
        </GameBtn>
      </div>

      {notice ? <div className="minion-equip-detail-panel__notice">{notice}</div> : null}

      <div className="minion-equip-detail-panel__body">
        <div className="minion-equip-detail-panel__doll-wrap">
          <MinionEquipDoll
            equipment={equipment}
            visibleSlots={clickableSlots}
            clickableSlots={clickableSlots}
            activeSlot={activeSlot}
            compact={compact}
            strip={isMobile}
            onSlotClick={(slotId) => {
              onSlotClick(slotId);
              props.onSlotCategoryHint?.(slotToBagCategory(slotId));
            }}
            onSlotDrop={isMobile ? undefined : onSlotDrop}
          />
        </div>

        <div className="minion-equip-detail-panel__side">
          {combatStats ? <MinionStatPanel stats={combatStats} compact /> : null}

          <p className="minion-equip-detail-panel__hint text-xs text-[var(--game-muted)]">
            {isMobile
              ? "슬롯을 탭한 뒤 가방에서 장비를 고르고 착용 버튼을 누르세요."
              : "슬롯을 선택한 뒤 가방에서 장비를 고르고 착용 버튼을 누르세요. 드래그해서 슬롯에 놓을 수도 있습니다."}
          </p>

          <p className="minion-equip-detail-panel__slot-label">
            선택 슬롯: <strong>{slotLabel(activeSlot)}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
