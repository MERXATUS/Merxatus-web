"use client";

import { ItemTooltipHover } from "@/app/_components/ItemTooltipHover";
import {
  weaponBaseAtkMagic,
  weaponBasePower,
  weaponDisplayName,
  weaponEnhancePowerBonus,
  weaponGradeIndex,
  weaponGradeLabel,
  weaponOptionPowerBonus,
  weaponTotalPower,
  type WeaponTooltipData,
} from "@/shared/weaponTooltip";
import type { ReactNode } from "react";

export function WeaponTooltipContent({ weapon }: { weapon: WeaponTooltipData }) {
  const grade = weaponGradeIndex(weapon);
  const baseAtkMagic = weaponBaseAtkMagic(weapon.baseItemId);
  const base = weaponBasePower(weapon.baseItemId);
  const enhance = weaponEnhancePowerBonus(weapon.enhanceLevel);
  const optBonus = weaponOptionPowerBonus(weapon.options);
  const total = weaponTotalPower(weapon);
  const weaponOpts = weapon.options ?? [];

  return (
    <div className={`item-tooltip item-tooltip--grade-${grade}`}>
      <div className="item-tooltip__name">{weaponDisplayName(weapon)}</div>
      <div className="item-tooltip__category">무기 · {weaponGradeLabel(weapon)}</div>

      <div className="item-tooltip__divider" />

      {baseAtkMagic ? (
        <>
          <div className="item-tooltip__stat-row">
            <span>물리 ATK</span>
            <span className="item-tooltip__stat-val">{baseAtkMagic.atk}</span>
          </div>
          {baseAtkMagic.magic > 0 ? (
            <div className="item-tooltip__stat-row">
              <span>마법 ATK</span>
              <span className="item-tooltip__stat-val">{baseAtkMagic.magic}</span>
            </div>
          ) : null}
          <div className="item-tooltip__divider" />
        </>
      ) : null}

      <div className="item-tooltip__stat-row">
        <span>전투력</span>
        <span className="item-tooltip__stat-val">{total}</span>
      </div>
      <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
        <span>기본</span>
        <span>{base}</span>
      </div>
      {enhance > 0 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>강화 (+{weapon.enhanceLevel})</span>
          <span>+{enhance}</span>
        </div>
      ) : null}
      {optBonus > 0 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>옵션 합</span>
          <span>+{optBonus}</span>
        </div>
      ) : null}

      {weaponOpts.length > 0 ? (
        <>
          <div className="item-tooltip__divider" />
          <div className="item-tooltip__section-label">추가 옵션</div>
          {weaponOpts.map((op, i) => (
            <div key={`${op.kind}-${i}`} className="item-tooltip__option-row">
              <span className="item-tooltip__option-tier">{op.tierLabel}</span>
              <span className="item-tooltip__option-label">{op.label}</span>
              <span className="item-tooltip__option-val">
                {op.displayValue >= 0 ? "+" : ""}
                {op.displayValue}
              </span>
            </div>
          ))}
        </>
      ) : null}

      <div className="item-tooltip__footer">ID {weapon.id.slice(0, 12)}…</div>
    </div>
  );
}

export function WeaponTooltipHover(props: {
  weapon: WeaponTooltipData;
  children: ReactNode;
  delayMs?: number;
}) {
  const { weapon, children, delayMs } = props;
  return (
    <ItemTooltipHover content={<WeaponTooltipContent weapon={weapon} />} delayMs={delayMs}>
      {children}
    </ItemTooltipHover>
  );
}
