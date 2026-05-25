"use client";

import { useMemo } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { canMinionEquipWeapon } from "@/shared/minionWeaponRules";
import {
  armorStackMatchesSlot,
  EQUIP_DRAG_MIME,
  type MinionEquipSlotId,
} from "@/shared/minionEquipSlots";
import {
  EQUIP_BAG_CATEGORIES_ACTIVE,
  stackItemBagCategory,
  type EquipBagCategory,
} from "@/shared/minionEquipBag";

type WeaponRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  grade?: number;
  icon?: string | null;
  iconSrc?: string;
};

type StackRow = {
  itemId: string;
  name: string;
  quantity: number;
  grade?: number;
  category?: string;
  icon?: string | null;
  iconSrc?: string;
};

type BagCell =
  | {
      key: string;
      kind: "weapon";
      weaponInstanceId: string;
      baseItemId: string;
      name: string;
      enhanceLevel: number;
      grade: number;
      icon?: string | null;
      iconSrc?: string;
      equipped: boolean;
    }
  | {
      key: string;
      kind: "stack";
      itemId: string;
      name: string;
      quantity: number;
      grade: number;
      icon?: string | null;
      iconSrc?: string;
    }
  | { key: string; kind: "unequip" };

export function MinionEquipBagPanel(props: {
  category: EquipBagCategory;
  onCategoryChange: (c: EquipBagCategory) => void;
  weapons: WeaponRow[];
  inventory: StackRow[];
  minionJobType: string;
  equippedWeaponInstanceId: string | null;
  equippedStackItemId?: string | null;
  activeSlot: MinionEquipSlotId;
  busy: boolean;
  onPick: (rawPayload: string) => void;
  onUnequip: () => void;
  onBack: () => void;
}) {
  const {
    category,
    onCategoryChange,
    weapons,
    inventory,
    minionJobType,
    equippedWeaponInstanceId,
    equippedStackItemId,
    activeSlot,
    busy,
    onPick,
    onUnequip,
    onBack,
  } = props;

  const cells = useMemo((): BagCell[] => {
    const out: BagCell[] = [];

    if (category === "weapon") {
      if (activeSlot === "weapon" && equippedWeaponInstanceId) {
        out.push({ key: "unequip", kind: "unequip" });
      }
      for (const w of weapons) {
        if (!canMinionEquipWeapon(minionJobType, w.baseItemId)) continue;
        out.push({
          key: `weapon:${w.id}`,
          kind: "weapon",
          weaponInstanceId: w.id,
          baseItemId: w.baseItemId,
          name: w.name,
          enhanceLevel: w.enhanceLevel,
          grade: w.grade ?? 1,
          icon: w.icon,
          iconSrc: w.iconSrc,
          equipped: equippedWeaponInstanceId === w.id,
        });
      }
      return out;
    }

    if (equippedStackItemId && activeSlot !== "weapon") {
      out.push({ key: "unequip", kind: "unequip" });
    }

    for (const s of inventory) {
      if (s.quantity <= 0) continue;
      if (stackItemBagCategory(s.itemId, s.category) !== category) continue;
      if (category === "armor" && !armorStackMatchesSlot(activeSlot, s.itemId)) continue;
      out.push({
        key: `stack:${s.itemId}`,
        kind: "stack",
        itemId: s.itemId,
        name: s.name,
        quantity: s.quantity,
        grade: s.grade ?? 1,
        icon: s.icon,
        iconSrc: s.iconSrc,
      });
    }
    return out;
  }, [category, weapons, inventory, minionJobType, equippedWeaponInstanceId, equippedStackItemId, activeSlot]);

  function dragPayload(cell: BagCell): string | null {
    if (cell.kind === "weapon") {
      return JSON.stringify({
        kind: "weapon",
        weaponInstanceId: cell.weaponInstanceId,
        baseItemId: cell.baseItemId,
      });
    }
    if (cell.kind === "stack") {
      return JSON.stringify({ kind: "stack", itemId: cell.itemId });
    }
    return null;
  }

  return (
    <div className="minion-equip-bag-panel">
      <div className="minion-equip-bag-panel__head">
        <div>
          <h3 className="text-sm font-bold text-[var(--game-text)]">장비 가방</h3>
          <p className="mt-0.5 text-[11px] text-[var(--game-muted)]">
            클릭 또는 드래그로 오른쪽 슬롯에 착용
          </p>
        </div>
        <button type="button" className="minion-equip-bag-panel__back" disabled={busy} onClick={onBack}>
          ← 미니언 목록
        </button>
      </div>

      <div className="minion-equip-bag-panel__tabs" role="tablist">
        {EQUIP_BAG_CATEGORIES_ACTIVE.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`minion-equip-bag-panel__tab ${category === c.id ? "minion-equip-bag-panel__tab--active" : ""}`}
            onClick={() => onCategoryChange(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {cells.length === 0 ? (
        <p className="minion-equip-bag-panel__empty text-sm text-[var(--game-muted)]">
          {category === "weapon"
            ? "착용 가능한 무기가 없습니다."
            : "선택한 슬롯에 맞는 방어구가 없습니다."}
        </p>
      ) : (
        <div className="inventory-item-list inventory-item-list--grid2 minion-equip-bag-panel__grid">
          {cells.map((cell) => {
            if (cell.kind === "unequip") {
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={busy}
                  className="inventory-item-card inventory-item-card--compact minion-equip-bag-panel__cell minion-equip-bag-panel__cell--unequip"
                  onClick={onUnequip}
                >
                  <span className="minion-equip-bag-panel__unequip-icon" aria-hidden>
                    ∅
                  </span>
                  <div className="inventory-item-card__body min-w-0">
                    <span className="inventory-item-card__name">착용 해제</span>
                  </div>
                </button>
              );
            }

            const payload = dragPayload(cell);
            const isWeapon = cell.kind === "weapon";

            return (
              <button
                key={cell.key}
                type="button"
                disabled={busy}
                draggable={!!payload && !busy}
                className={[
                  "inventory-item-card inventory-item-card--compact minion-equip-bag-panel__cell",
                  isWeapon && cell.equipped ? "minion-equip-bag-panel__cell--equipped" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => payload && onPick(payload)}
                onDragStart={(e) => {
                  if (!payload) return;
                  e.dataTransfer.setData(EQUIP_DRAG_MIME, payload);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <ItemIcon
                  itemId={isWeapon ? cell.baseItemId : cell.itemId}
                  icon={cell.icon}
                  iconSrc={cell.iconSrc}
                  size={48}
                  className="shrink-0"
                  eager
                />
                <div className="inventory-item-card__body min-w-0">
                  <span className={`inventory-item-card__name ${itemGradeNameClassName(cell.grade)}`}>
                    {cell.name}
                    {isWeapon && cell.enhanceLevel > 0 ? ` +${cell.enhanceLevel}` : ""}
                  </span>
                  {!isWeapon ? (
                    <span className="inventory-item-card__meta">×{cell.quantity}</span>
                  ) : cell.equipped ? (
                    <span className="minion-equip-bag-panel__equipped-tag">착용 중</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
