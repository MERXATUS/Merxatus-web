"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArmorTooltipHover } from "@/app/_components/ArmorTooltip";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { WeaponTooltipHover } from "@/app/_components/WeaponTooltip";
import { itemGradeFrameClassName, itemGradeNameClassName } from "@/server/itemGrade";
import { weaponEnhanceMaxLevelForGrade } from "@/shared/weaponEnhanceLimits";
import { armorDisplayName } from "@/shared/armorTooltip";
import { weaponDisplayName } from "@/shared/weaponTooltip";
import type { ArmorTooltipData } from "@/shared/armorTooltip";
import type { WeaponTooltipData } from "@/shared/weaponTooltip";
import { renderForgeOptionChips } from "@/app/_components/ForgeToolPicker";
import { ForgeEquippedByTag } from "@/app/_components/ForgeEquippedByTag";

export type ForgePickerItem = WeaponTooltipData | ArmorTooltipData;

type ForgeViewMode = "icons" | "list";

const VIEW_MODE_KEY = "inv_view_mode_v1";
const DEFAULT_VIEW_MODE: ForgeViewMode = "list";

function readViewMode(): ForgeViewMode {
  if (typeof window === "undefined") return DEFAULT_VIEW_MODE;
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === "grid2") return "list";
    if (raw === "icons" || raw === "list") return raw;
    return DEFAULT_VIEW_MODE;
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

function writeViewMode(mode: ForgeViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

type Props = {
  mode: "enhance" | "craft";
  equipKind: "weapon" | "armor";
  onEquipKindChange: (kind: "weapon" | "armor") => void;
  items: ForgePickerItem[];
  onPick: (id: string) => void;
  toolbar?: ReactNode;
  emptyMessage?: string;
};

function isWeapon(item: ForgePickerItem, kind: "weapon" | "armor"): item is WeaponTooltipData {
  return kind === "weapon";
}

export function ForgeEquipPicker(props: Props) {
  const modeLabel = props.mode === "enhance" ? "제련" : "가공";
  const empty =
    props.emptyMessage ??
    (props.equipKind === "weapon" ? `${modeLabel}할 무기가 없어요.` : `${modeLabel}할 방어구가 없어요.`);

  const [viewMode, setViewMode] = useState<ForgeViewMode>(DEFAULT_VIEW_MODE);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  useEffect(() => {
    writeViewMode(viewMode);
  }, [viewMode]);

  function renderIcon(item: ForgePickerItem, size: number) {
    const icon = <ItemIcon itemId={item.baseItemId} size={size} className="item-icon shrink-0" />;
    return isWeapon(item, props.equipKind) ? (
      <WeaponTooltipHover weapon={{ ...item, identified: item.identified }}>{icon}</WeaponTooltipHover>
    ) : (
      <ArmorTooltipHover armor={{ ...item, identified: item.identified }}>{icon}</ArmorTooltipHover>
    );
  }

  return (
    <section className="forge-lobby" aria-label={`${modeLabel} 장비 선택`}>
      <header className="forge-lobby__banner">
        <div className="forge-lobby__banner-glow" aria-hidden />
        <p className="forge-lobby__eyebrow">대장간</p>
        <h2 className="forge-lobby__title">
          {props.mode === "enhance" ? "제련할 장비를 고르세요" : "가공할 장비를 고르세요"}
        </h2>
        <p className="forge-lobby__lead">
          {props.mode === "enhance"
            ? "장비를 선택하면 제련 작업대가 열립니다. 마석·골드를 모아 단계를 올려 보세요."
            : "감정·보석 가공은 장비를 고른 뒤 작업대에서 진행합니다."}
        </p>
      </header>

      <div className="forge-lobby__panel">
        <div className="forge-lobby__toolbar">
          <div className="forge-hub__kind-toggle">
            <button
              type="button"
              className={`forge-hub__kind ${props.equipKind === "weapon" ? "forge-hub__kind--active" : ""}`}
              onClick={() => props.onEquipKindChange("weapon")}
            >
              무기
            </button>
            <button
              type="button"
              className={`forge-hub__kind ${props.equipKind === "armor" ? "forge-hub__kind--active" : ""}`}
              onClick={() => props.onEquipKindChange("armor")}
            >
              방어구
            </button>
          </div>
          <div className="inventory-view-toggle forge-lobby__view-toggle">
            <button
              type="button"
              className={`inventory-view-btn ${viewMode === "icons" ? "inventory-view-btn--active" : ""}`}
              onClick={() => setViewMode("icons")}
              title="아이콘만"
            >
              아이콘
            </button>
            <button
              type="button"
              className={`inventory-view-btn ${viewMode === "list" ? "inventory-view-btn--active" : ""}`}
              onClick={() => setViewMode("list")}
              title="상세 목록"
            >
              목록
            </button>
          </div>
          {props.toolbar}
        </div>

        <div
          className={[
            "forge-lobby__list",
            viewMode === "list" ? "forge-lobby__list--list" : "forge-lobby__list--icons",
          ].join(" ")}
        >
          {props.items.length === 0 ? (
            <p className="forge-lobby__empty">{empty}</p>
          ) : (
            props.items.map((item) => {
              const lv = item.enhanceLevel ?? 0;

              if (viewMode === "icons") {
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`forge-lobby__icon-cell ${itemGradeFrameClassName(item.grade ?? 1)}`}
                    onClick={() => props.onPick(item.id)}
                    aria-label={
                      isWeapon(item, props.equipKind)
                        ? weaponDisplayName({ ...item, identified: item.identified })
                        : armorDisplayName({ ...item, identified: item.identified })
                    }
                  >
                    {renderIcon(item, 40)}
                    {lv > 0 ? <span className="forge-lobby__icon-cell-badge">+{lv}</span> : null}
                    <ForgeEquippedByTag equippedByMinion={item.equippedByMinion} compact className="forge-lobby__icon-equipped" />
                    {item.identified === false ? (
                      <span className="forge-lobby__icon-cell-dot" aria-label="미감정" />
                    ) : null}
                  </button>
                );
              }

              const maxLv = weaponEnhanceMaxLevelForGrade(item.grade ?? 1);
              const pct = maxLv > 0 ? Math.min(100, (lv / maxLv) * 100) : 0;
              const displayName = isWeapon(item, props.equipKind)
                ? weaponDisplayName({ ...item, identified: item.identified })
                : armorDisplayName({ ...item, identified: item.identified });

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`forge-lobby__card ${itemGradeFrameClassName(item.grade ?? 1)}`}
                  onClick={() => props.onPick(item.id)}
                >
                  <div className="forge-lobby__card-icon-wrap">
                    <div className="forge-lobby__card-icon-slot">{renderIcon(item, 52)}</div>
                    {lv > 0 ? <span className="forge-lobby__card-badge">+{lv}</span> : null}
                    {item.identified === false ? (
                      <span className="forge-lobby__card-unid" aria-label="미감정" />
                    ) : null}
                  </div>

                  <div className="forge-lobby__card-body">
                    <div className="forge-lobby__card-head">
                      <span className={`forge-lobby__card-name ${itemGradeNameClassName(item.grade ?? 1)}`}>
                        {displayName}
                      </span>
                      {item.gradeLabel ? (
                        <span className="forge-lobby__card-grade">{item.gradeLabel}</span>
                      ) : null}
                    </div>
                    <div className="forge-lobby__card-meta">
                      <span>+{lv}</span>
                      <span className="forge-lobby__card-meta-sep">/</span>
                      <span>+{maxLv}</span>
                      {props.mode === "enhance" ? (
                        <span className="forge-lobby__card-meta-hint">제련 단계</span>
                      ) : item.identified === false ? (
                        <span className="forge-lobby__card-meta-hint">미감정</span>
                      ) : null}
                    </div>
                    <ForgeEquippedByTag equippedByMinion={item.equippedByMinion} />
                    <div className="forge-lobby__card-bar" aria-hidden>
                      <div className="forge-lobby__card-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    {(item.options?.length ?? 0) > 0 ? (
                      <div className="forge-lobby__card-options">
                        {renderForgeOptionChips(item.options ?? [], props.equipKind, { maxVisible: 2 })}
                      </div>
                    ) : null}
                  </div>

                  <span className="forge-lobby__card-cta" aria-hidden>
                    {props.mode === "enhance" ? "제련" : "가공"}
                    <span className="forge-lobby__card-cta-arrow">→</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
