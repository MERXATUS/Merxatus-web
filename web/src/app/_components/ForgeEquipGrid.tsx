"use client";

import type { ReactNode } from "react";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { itemGradeFrameClassName } from "@/server/itemGrade";
import type { ArmorTooltipData } from "@/shared/armorTooltip";
import type { WeaponTooltipData } from "@/shared/weaponTooltip";

export type ForgeEquipGridWeaponItem = WeaponTooltipData;
export type ForgeEquipGridArmorItem = ArmorTooltipData;

export type ForgeEquipGridItem = ForgeEquipGridWeaponItem | ForgeEquipGridArmorItem;

function isWeaponItem(item: ForgeEquipGridItem, equipKind: "weapon" | "armor"): item is ForgeEquipGridWeaponItem {
  return equipKind === "weapon";
}

export function ForgeEquipGrid(props: {
  title: string;
  equipKind: "weapon" | "armor";
  items: ForgeEquipGridItem[];
  /** 단일 선택 */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** 다중 선택 — `selectedId`/`onSelect` 대신 사용 */
  multiSelect?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
  toolbar?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <aside className="forge-equip-rail">
      <div className="forge-rail__head">
        <p className="forge-rail__title">{props.title}</p>
      </div>
      {props.toolbar ? <div className="forge-rail__toolbar">{props.toolbar}</div> : null}
      <div className="forge-equip-grid">
        {props.items.length === 0 ? (
          <p className="forge-rail__empty">{props.emptyMessage ?? "없음"}</p>
        ) : (
          props.items.map((item) => {
            const active = props.multiSelect
              ? (props.selectedIds?.has(item.id) ?? false)
              : item.id === props.selectedId;
            const lv = item.enhanceLevel ?? 0;
            const icon = (
              <ItemIcon itemId={item.baseItemId} size={44} className="item-icon forge-equip-cell__icon" />
            );
            const iconWithTooltip = isWeaponItem(item, props.equipKind) ? (
              <WeaponTooltipHover weapon={{ ...item, identified: item.identified }}>
                {icon}
              </WeaponTooltipHover>
            ) : (
              <ArmorTooltipHover armor={{ ...item, identified: item.identified }}>{icon}</ArmorTooltipHover>
            );

            return (
              <button
                key={item.id}
                type="button"
                className={`forge-equip-cell ${itemGradeFrameClassName(item.grade ?? 1)} ${active ? "forge-equip-cell--active" : ""}`}
                onClick={() =>
                  props.multiSelect
                    ? props.onToggleSelect?.(item.id)
                    : props.onSelect?.(item.id)
                }
                aria-pressed={active}
              >
                {iconWithTooltip}
                {props.multiSelect && active ? (
                  <span className="forge-equip-cell__check" aria-hidden>
                    ✓
                  </span>
                ) : null}
                {lv > 0 ? <span className="forge-equip-cell__badge">+{lv}</span> : null}
                {item.identified === false ? (
                  <span className="forge-equip-cell__dot" aria-label="미감정" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
