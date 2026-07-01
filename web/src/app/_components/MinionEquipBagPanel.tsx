"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { GameBtn } from "@/app/_components/gameUi";
import { itemGradeFrameClassName, itemGradeNameClassName } from "@/server/itemGrade";
import type { ArmorTooltipData } from "@/shared/armorTooltip";
import type { StackItemTooltipData } from "@/shared/stackItemTooltip";
import type { WeaponTooltipData, WeaponTooltipOption } from "@/shared/weaponTooltip";
import {
  canMinionEquipItemByCombatPower,
  minEquipCombatPowerForGrade,
  requiredEquipCombatPowerForInstance,
} from "@/shared/itemEquipLevel";
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
import { useIsMobile } from "@/shared/useIsMobile";
type EquipOptionRow = WeaponTooltipOption;

type WeaponRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  icon?: string | null;
  iconSrc?: string;
};

type ArmorRow = {
  id: string;
  baseItemId: string;
  name: string;
  enhanceLevel?: number;
  quality?: number;
  qualityCraftCount?: number;
  itemLevel?: number;
  grade?: number;
  gradeLabel?: string;
  identified?: boolean;
  options?: EquipOptionRow[];
  icon?: string | null;
  iconSrc?: string;
};

type StackRow = {
  itemId: string;
  name: string;
  quantity: number;
  grade?: number;
  gradeLabel?: string;
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
      quality?: number;
      qualityCraftCount?: number;
      itemLevel?: number;
      grade: number;
      gradeLabel?: string;
      identified?: boolean;
      options?: EquipOptionRow[];
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
      enhanceLevel: number;
      quality?: number;
      qualityCraftCount?: number;
      itemLevel?: number;
      grade: number;
      gradeLabel?: string;
      identified?: boolean;
      options?: EquipOptionRow[];
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
      gradeLabel?: string;
      category?: string;
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
  minionCombatPower?: number;
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
    minionCombatPower,
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

  const isMobile = useIsMobile();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const categoryTabs = EQUIP_BAG_CATEGORIES_ACTIVE.filter((c) => bagCategories.includes(c.id));

  useEffect(() => {
    setSelectedKey(null);
  }, [category, activeSlot]);

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
          quality: w.quality,
          qualityCraftCount: w.qualityCraftCount,
          itemLevel: w.itemLevel,
          grade: w.grade ?? 1,
          gradeLabel: w.gradeLabel,
          identified: w.identified,
          options: w.options,
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
          enhanceLevel: a.enhanceLevel ?? 0,
          quality: a.quality,
          qualityCraftCount: a.qualityCraftCount,
          itemLevel: a.itemLevel,
          grade: a.grade ?? 1,
          gradeLabel: a.gradeLabel,
          identified: a.identified,
          options: a.options,
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
          gradeLabel: s.gradeLabel,
          category: s.category,
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
        gradeLabel: s.gradeLabel,
        category: s.category,
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

  function bagCellIcon(cell: Exclude<BagCell, { kind: "unequip" }>, iconItemId: string): ReactNode {
    const icon = (
      <ItemIcon
        itemId={iconItemId}
        icon={cell.icon}
        iconSrc={cell.iconSrc}
        size={48}
        className="shrink-0"
        eager
      />
    );

    if (cell.kind === "weapon") {
      const weapon: WeaponTooltipData = {
        id: cell.weaponInstanceId,
        baseItemId: cell.baseItemId,
        name: cell.name,
        enhanceLevel: cell.enhanceLevel,
        quality: cell.quality,
        qualityCraftCount: cell.qualityCraftCount,
        itemLevel: cell.itemLevel,
        grade: cell.grade,
        gradeLabel: cell.gradeLabel,
        identified: cell.identified,
        options: cell.options,
      };
      return <WeaponTooltipHover weapon={weapon}>{icon}</WeaponTooltipHover>;
    }

    if (cell.kind === "armor") {
      const armor: ArmorTooltipData = {
        id: cell.armorInstanceId,
        baseItemId: cell.baseItemId,
        name: cell.name,
        enhanceLevel: cell.enhanceLevel,
        quality: cell.quality,
        qualityCraftCount: cell.qualityCraftCount,
        itemLevel: cell.itemLevel,
        grade: cell.grade,
        gradeLabel: cell.gradeLabel,
        identified: cell.identified,
        options: cell.options,
      };
      return <ArmorTooltipHover armor={armor}>{icon}</ArmorTooltipHover>;
    }

    const stack: StackItemTooltipData = {
      itemId: cell.itemId,
      name: cell.name,
      category: cell.category ?? "방어구",
      grade: cell.grade,
      gradeLabel: cell.gradeLabel,
      quantity: cell.quantity,
    };
    return <StackItemTooltipHover item={stack}>{icon}</StackItemTooltipHover>;
  }

  function cellLevelBlocked(cell: Exclude<BagCell, { kind: "unequip" }>): boolean {
    if (minionCombatPower == null) return false;
    const baseItemId = cell.kind === "stack" ? cell.itemId : cell.baseItemId;
    const instanceItemLevel = cell.kind === "weapon" || cell.kind === "armor" ? cell.itemLevel : undefined;
    return !canMinionEquipItemByCombatPower(
      minionCombatPower,
      baseItemId,
      cell.grade,
      instanceItemLevel,
    );
  }

  function cellRequiredLevel(cell: Exclude<BagCell, { kind: "unequip" }>): number {
    const baseItemId = cell.kind === "stack" ? cell.itemId : cell.baseItemId;
    const instanceItemLevel = cell.kind === "weapon" || cell.kind === "armor" ? cell.itemLevel : undefined;
    return requiredEquipCombatPowerForInstance(baseItemId, cell.grade, instanceItemLevel);
  }

  function cellAlreadyEquipped(cell: Exclude<BagCell, { kind: "unequip" }>): boolean {
    if (cell.kind === "weapon") return cell.equipped;
    if (cell.kind === "armor") return equippedArmorInstanceId === cell.armorInstanceId;
    if (cell.kind === "stack") return equippedStackItemId === cell.itemId;
    return false;
  }

  const selectedCell = useMemo(
    () => cells.find((c) => c.key === selectedKey && c.kind !== "unequip") ?? null,
    [cells, selectedKey],
  );

  const canEquipSelected =
    selectedCell != null &&
    selectedCell.kind !== "unequip" &&
    !cellLevelBlocked(selectedCell) &&
    !cellAlreadyEquipped(selectedCell);

  function equipSelected() {
    if (!selectedCell || selectedCell.kind === "unequip") return;
    const payload = dragPayload(selectedCell);
    if (!payload || cellLevelBlocked(selectedCell) || cellAlreadyEquipped(selectedCell)) return;
    onPick(payload);
    setSelectedKey(null);
  }

  return (
    <div className={`minion-equip-bag-panel ${compact ? "minion-equip-bag-panel--compact" : ""}`}>
      <div className="minion-equip-bag-panel__head">
        <div>
          <h3 className="minion-equip-bag-panel__title">장비 가방</h3>
          {!compact ? (
            <p className="minion-equip-bag-panel__subtitle">
              {isMobile ? "아이템을 고른 뒤 착용 버튼을 누르세요" : "아이템 선택 후 착용 — 드래그로 슬롯에 놓을 수도 있습니다"}
            </p>
          ) : isMobile ? (
            <p className="minion-equip-bag-panel__subtitle">선택 후 착용</p>
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
            const levelBlocked = cellLevelBlocked(cell);
            const requiredLevel = cellRequiredLevel(cell);
            const alreadyEquipped = cellAlreadyEquipped(cell);
            const isSelected = selectedKey === cell.key;
            const iconItemId =
              cell.kind === "weapon" || cell.kind === "armor" ? cell.baseItemId : cell.itemId;

            return (
              <button
                key={cell.key}
                type="button"
                disabled={busy || levelBlocked}
                draggable={!isMobile && !!payload && !busy && !levelBlocked}
                className={[
                  "inventory-item-card inventory-item-card--compact minion-equip-bag-panel__cell",
                  cell.kind === "weapon" || cell.kind === "armor"
                    ? itemGradeFrameClassName(cell.grade)
                    : "",
                  isWeapon && cell.equipped ? "minion-equip-bag-panel__cell--equipped" : "",
                  levelBlocked ? "minion-equip-bag-panel__cell--blocked" : "",
                  isSelected ? "minion-equip-bag-panel__cell--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (levelBlocked) return;
                  setSelectedKey((prev) => (prev === cell.key ? null : cell.key));
                }}
                onDragStart={(e) => {
                  if (!payload) return;
                  e.dataTransfer.setData(EQUIP_DRAG_MIME, payload);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                {bagCellIcon(cell, iconItemId)}
                <div className="inventory-item-card__body min-w-0">
                  <span className={`inventory-item-card__name ${itemGradeNameClassName(cell.grade)}`}>
                    {cell.name}
                    {isWeapon && cell.enhanceLevel > 0 ? ` +${cell.enhanceLevel}` : ""}
                  </span>
                  {cell.kind === "stack" ? (
                    <span className="inventory-item-card__meta">×{cell.quantity}</span>
                  ) : levelBlocked ? (
                    <span className="minion-equip-bag-panel__level-tag">CP {requiredLevel.toLocaleString()} 필요</span>
                  ) : alreadyEquipped ? (
                    <span className="minion-equip-bag-panel__equipped-tag">착용 중</span>
                  ) : isSelected ? (
                    <span className="minion-equip-bag-panel__selected-tag">선택됨</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="minion-equip-bag-panel__actions">
        <GameBtn
          variant="primary"
          className="minion-equip-bag-panel__equip-btn"
          disabled={busy || !canEquipSelected}
          onClick={equipSelected}
        >
          착용
        </GameBtn>
      </div>
    </div>
  );
}
