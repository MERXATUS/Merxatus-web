"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import {
  EQUIP_DRAG_MIME,
  isMinionEquipSlotEnabled,
  isMinionEquipSlotImplemented,
  MINION_EQUIP_SLOTS,
  type MinionEquipSlotId,
  type MinionEquipmentView,
  type MinionEquippedItemView,
} from "@/shared/minionEquipSlots";

export function MinionEquipDoll(props: {
  equipment?: MinionEquipmentView;
  clickableSlots?: MinionEquipSlotId[];
  onSlotClick?: (slotId: MinionEquipSlotId) => void;
  onSlotDrop?: (slotId: MinionEquipSlotId, rawPayload: string) => void;
  activeSlot?: MinionEquipSlotId | null;
  compact?: boolean;
  large?: boolean;
}) {
  const equipment = props.equipment ?? {};
  const clickable = new Set(props.clickableSlots ?? (props.onSlotClick ? ["weapon"] : []));
  const iconSize = props.large ? 44 : props.compact ? 28 : 36;
  const dollClass = [
    "minion-equip-doll",
    props.compact ? "minion-equip-doll--compact" : "",
    props.large ? "minion-equip-doll--large" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={dollClass} aria-label="장비 착용">
      {MINION_EQUIP_SLOTS.map((slot) => {
        const item = equipment[slot.id] ?? null;
        const filled = !!item;
        const enabled = isMinionEquipSlotEnabled(slot.id);
        const implemented = isMinionEquipSlotImplemented(slot.id);
        const slotProps = {
          slotId: slot.id,
          label: slot.label,
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

        if (!enabled) {
          return <SlotDisabled key={slot.id} {...slotProps} />;
        }

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
  label: string;
  item: MinionEquippedItemView | null;
  filled: boolean;
  enabled: boolean;
  implemented: boolean;
  iconSize: number;
}) {
  if (props.filled && props.item) {
    const lv = props.item.enhanceLevel ?? 0;
    return (
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
    );
  }
  return (
    <span className="minion-equip-slot__empty">
      {props.label}
      {!props.enabled ? <span className="minion-equip-slot__locked">잠김</span> : null}
    </span>
  );
}

type SlotCommon = {
  slotId: MinionEquipSlotId;
  label: string;
  item: MinionEquippedItemView | null;
  filled: boolean;
  enabled: boolean;
  implemented: boolean;
  iconSize: number;
  active?: boolean;
};

function SlotDisabled(props: SlotCommon) {
  return (
    <div
      title={`${props.label} (추후 업데이트)`}
      className={slotClass(props.slotId, props.filled, "minion-equip-slot--disabled")}
      style={{ gridArea: props.slotId }}
      aria-disabled="true"
    >
      <SlotContents {...props} />
    </div>
  );
}

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
      style={{ gridArea: props.slotId }}
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
      style={{ gridArea: props.slotId }}
    >
      <SlotContents {...props} />
    </div>
  );
}
