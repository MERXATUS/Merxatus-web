"use client";

import { useMemo } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { itemGradeNameClassName } from "@/server/itemGrade";
import { canMinionEquipWeaponForClass } from "@/shared/minionWeaponRules";
import type { MinionCombatClass } from "@/shared/minionDerivedClass";
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

type ArmorRow = {
  id: string;
  baseItemId: string;
  name: string;
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
      kind: "armor";
      armorInstanceId: string;
      baseItemId: string;
      name: string;
      grade: number;
      icon?: string | null;
      iconSrc?: string;
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
  armorInstances?: ArmorRow[];
  inventory: StackRow[];
  minionCombatClass?: MinionCombatClass;
  equippedWeaponInstanceId: string | null;
  equippedStackItemId?: string | null;
  equippedArmorInstanceId?: string | null;
  blockedArmorInstanceIds?: Set<string>;
  activeSlot: MinionEquipSlotId;
  busy: boolean;
  onPick: (rawPayload: string) => void;
  onUnequip: () => void;
  onBack: () => void;
  bagCategories?: EquipBagCategory[];
  compact?: boolean;
}) {
  const {
    category,
    onCategoryChange,
    weapons,
    armorInstances = [],
    inventory,
    minionCombatClass,
    equippedWeaponInstanceId,
    equippedStackItemId,
    equippedArmorInstanceId,
    blockedArmorInstanceIds,
    activeSlot,
    busy,
    onPick,
    onUnequip,
    onBack,
    bagCategories = EQUIP_BAG_CATEGORIES_ACTIVE.map((c) => c.id),
    compact,
  } = props;

  const categoryTabs = EQUIP_BAG_CATEGORIES_ACTIVE.filter((c) => bagCategories.includes(c.id));

  const cells = useMemo((): BagCell[] => {
    const out: BagCell[] = [];

    if (category === "weapon") {
      if (activeSlot === "weapon" && equippedWeaponInstanceId) {
        out.push({ key: "unequip", kind: "unequip" });
      }
      for (const w of weapons) {
        const combatClass = minionCombatClass ?? "ADVENTURER";
        if (!canMinionEquipWeaponForClass(combatClass, w.baseItemId)) continue;
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

    if (category === "armor") {
      const slotHasEquipped =
        activeSlot !== "weapon" && (!!equippedArmorInstanceId || !!equippedStackItemId);
      if (slotHasEquipped) {
        out.push({ key: "unequip", kind: "unequip" });
      }
      for (const a of armorInstances) {
        if (!armorStackMatchesSlot(activeSlot, a.baseItemId)) continue;
        if (blockedArmorInstanceIds?.has(a.id)) continue;
        out.push({
          key: `armor:${a.id}`,
          kind: "armor",
          armorInstanceId: a.id,
          baseItemId: a.baseItemId,
          name: a.name,
          grade: a.grade ?? 1,
          icon: a.icon,
          iconSrc: a.iconSrc,
        });
      }
      for (const s of inventory) {
        if (s.quantity <= 0) continue;
        if (stackItemBagCategory(s.itemId, s.category) !== "armor") continue;
        if (!armorStackMatchesSlot(activeSlot, s.itemId)) continue;
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
    }

    if (equippedStackItemId && activeSlot !== "weapon") {
      out.push({ key: "unequip", kind: "unequip" });
    }

    for (const s of inventory) {
      if (s.quantity <= 0) continue;
      if (stackItemBagCategory(s.itemId, s.category) !== category) continue;
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
  }, [
    category,
    weapons,
    armorInstances,
    inventory,
    minionCombatClass,
    equippedWeaponInstanceId,
    equippedStackItemId,
    equippedArmorInstanceId,
    blockedArmorInstanceIds,
    activeSlot,
  ]);

  function dragPayload(cell: BagCell): string | null {
    if (cell.kind === "weapon") {
      return JSON.stringify({
        kind: "weapon",
        weaponInstanceId: cell.weaponInstanceId,
        baseItemId: cell.baseItemId,
      });
    }
    if (cell.kind === "armor") {
      return JSON.stringify({
        kind: "armor",
        armorInstanceId: cell.armorInstanceId,
        baseItemId: cell.baseItemId,
      });
    }
    if (cell.kind === "stack") {
      return JSON.stringify({ kind: "stack", itemId: cell.itemId });
    }
    return null;
  }

  return (
    <div className={`minion-equip-bag-panel ${compact ? "minion-equip-bag-panel--compact" : ""}`}>
      <div className="minion-equip-bag-panel__head">
        <div>
          <h3 className="minion-equip-bag-panel__title">장비 가방</h3>
          {!compact ? (
            <p className="minion-equip-bag-panel__subtitle">
              클릭 또는 드래그로 오른쪽 슬롯에 착용
            </p>
          ) : null}
        </div>
        <button type="button" className="minion-equip-bag-panel__back" disabled={busy} onClick={onBack}>
          {compact ? "← 목록" : "← 미니언 목록"}
        </button>
      </div>

      <div className="minion-equip-bag-panel__tabs" role="tablist">
        {categoryTabs.map((c) => (
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
            const isArmor = cell.kind === "armor";
            const iconItemId =
              cell.kind === "weapon" || cell.kind === "armor" ? cell.baseItemId : cell.itemId;

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
                  itemId={iconItemId}
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
                  {cell.kind === "stack" ? (
                    <span className="inventory-item-card__meta">×{cell.quantity}</span>
                  ) : isWeapon && cell.equipped ? (
                    <span className="minion-equip-bag-panel__equipped-tag">착용 중</span>
                  ) : isArmor && equippedArmorInstanceId === cell.armorInstanceId ? (
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
