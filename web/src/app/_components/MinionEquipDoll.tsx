"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { MinionEquippedItemTooltip } from "@/app/_components/MinionEquippedItemTooltip";
import {
  EQUIP_DRAG_MIME,
  isMinionEquipSlotEnabled,
  isMinionEquipSlotImplemented,
  MINION_EQUIP_SLOTS,
  type MinionEquipSlotId,
  type MinionEquipmentView,
  type MinionEquippedItemView,
} from "@/shared/minionEquipSlots";

/** UI 표시 순: 방어구 + 무기 + 악세서리(착용 모드) */
const EQUIP_DISPLAY_ORDER: MinionEquipSlotId[] = [
  "helmet",
  "armor",
  "pants",
  "shoes",
  "weapon",
  "ring1",
  "ring2",
  "necklace",
  "necklace2",
  "relic",
  "relic2",
  "relic3",
];

export function MinionEquipDoll(props: {
  equipment?: MinionEquipmentView;
  clickableSlots?: MinionEquipSlotId[];
  visibleSlots?: MinionEquipSlotId[];
  onSlotClick?: (slotId: MinionEquipSlotId) => void;
  onSlotDrop?: (slotId: MinionEquipSlotId, rawPayload: string) => void;
  activeSlot?: MinionEquipSlotId | null;
  compact?: boolean;
  large?: boolean;
  /** 전신 종이인형 배치 (모든 슬롯을 3열로 크게) */
  paperdoll?: boolean;
  /** fit 패널용 — 착용 슬롯만 가로 1줄 */
  strip?: boolean;
}) {
  const equipment = props.equipment ?? {};
  const visible = props.visibleSlots ? new Set(props.visibleSlots) : null;
  const clickable = new Set(props.clickableSlots ?? (props.onSlotClick ? ["weapon"] : []));
  const iconSize = props.strip ? 24 : props.paperdoll ? 48 : props.large ? 44 : props.compact ? 28 : 36;
  const dollClass = [
    "minion-equip-doll",
    props.paperdoll ? "minion-equip-doll--paperdoll" : "",
    props.compact ? "minion-equip-doll--compact" : "",
    props.strip ? "minion-equip-doll--strip" : "",
    props.large ? "minion-equip-doll--large" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const slotsToRender = EQUIP_DISPLAY_ORDER.map((id) => MINION_EQUIP_SLOTS.find((s) => s.id === id))
    .filter((slot): slot is (typeof MINION_EQUIP_SLOTS)[number] => {
      if (!slot) return false;
      if (!isMinionEquipSlotEnabled(slot.id)) return false;
      if (visible && !visible.has(slot.id)) return false;
      return true;
    });

  return (
    <div className={dollClass} aria-label="장비 착용">
      {slotsToRender.map((slot) => {
        const item = equipment[slot.id] ?? null;
        const filled = !!item;
        const enabled = isMinionEquipSlotEnabled(slot.id);
        const implemented = isMinionEquipSlotImplemented(slot.id);
        const slotProps = {
          slotId: slot.id,
          label: slot.label,
          shortLabel: slot.shortLabel,
          strip: props.strip,
          item,
          filled,
          enabled,
          implemented,
          iconSize,
          active: props.activeSlot === slot.id,
          canClick: enabled && clickable.has(slot.id) && !!props.onSlotClick,
          droppable: enabled && !!props.onSlotDrop,
          onClick: props.onSlotClick ? () => props.onSlotClick!(slot.id) : undefined,
          onDrop: props.onSlotDrop
            ? (raw: string) => props.onSlotDrop!(slot.id, raw)
            : undefined,
        };

        if (slotProps.canClick || slotProps.droppable) {
          return <SlotInteractive key={slot.id} {...slotProps} />;
        }

        return <SlotStatic key={slot.id} {...slotProps} />;
      })}
    </div>
  );
}

function slotClass(
  slotId: MinionEquipSlotId,
  filled: boolean,
  extra?: string,
) {
  return [
    "minion-equip-slot",
    `minion-equip-slot--${slotId}`,
    filled ? "minion-equip-slot--filled" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

function SlotContents(props: {
  slotId: MinionEquipSlotId;
  label: string;
  shortLabel?: string;
  strip?: boolean;
  item: MinionEquippedItemView | null;
  filled: boolean;
  enabled: boolean;
  implemented: boolean;
  iconSize: number;
}) {
  if (props.filled && props.item) {
    const lv = props.item.enhanceLevel ?? 0;
    return (
      <MinionEquippedItemTooltip item={props.item} slotId={props.slotId}>
        <div className="minion-equip-slot__item">
          <ItemIcon
            itemId={props.item.baseItemId}
            icon={props.item.icon}
            size={props.iconSize}
            className="minion-equip-slot__icon"
            eager
          />
          {lv > 0 ? <span className="minion-equip-slot__enhance">+{lv}</span> : null}
        </div>
      </MinionEquippedItemTooltip>
    );
  }
  const emptyLabel = props.strip ? (props.shortLabel ?? props.label.slice(0, 2)) : props.label;
  return (
    <span className="minion-equip-slot__empty">
      {emptyLabel}
      {!props.enabled ? <span className="minion-equip-slot__locked">잠김</span> : null}
    </span>
  );
}

type SlotCommon = {
  slotId: MinionEquipSlotId;
  label: string;
  shortLabel?: string;
  strip?: boolean;
  item: MinionEquippedItemView | null;
  filled: boolean;
  enabled: boolean;
  implemented: boolean;
  iconSize: number;
  active?: boolean;
};

function SlotInteractive(
  props: SlotCommon & {
    canClick: boolean;
    droppable: boolean;
    onClick?: () => void;
    onDrop?: (raw: string) => void;
  },
) {
  const title = props.filled
    ? `${props.item!.name}${props.canClick ? " — 클릭하여 슬롯 선택" : ""}`
    : `${props.label}${props.canClick ? " — 클릭하여 선택" : ""}`;

  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      className={slotClass(
        props.slotId,
        props.filled,
        [
          props.canClick ? "minion-equip-slot--clickable" : "",
          props.active ? "minion-equip-slot--active" : "",
          props.droppable ? "minion-equip-slot--droppable" : "",
        ]
          .filter(Boolean)
          .join(" "),
      )}
      onClick={props.canClick ? props.onClick : undefined}
      onKeyDown={(e) => {
        if (!props.canClick || !props.onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      onDragOver={(e) => {
        if (!props.droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (!props.droppable || !props.onDrop) return;
        e.preventDefault();
        const raw = e.dataTransfer.getData(EQUIP_DRAG_MIME);
        if (raw) props.onDrop(raw);
      }}
    >
      <SlotContents {...props} />
    </div>
  );
}

function SlotStatic(props: SlotCommon) {
  return (
    <div
      title={props.implemented ? props.label : `${props.label} (준비 중)`}
      className={slotClass(props.slotId, props.filled)}
    >
      <SlotContents {...props} />
    </div>
  );
}
