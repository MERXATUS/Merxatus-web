"use client";

import { ItemTooltipHover } from "@/app/_components/ItemTooltipHover";
import { EquipmentBlessingOptionRows } from "@/app/_components/EquipmentBlessingOptionRows";
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
import { requiredEquipLevelForInstance } from "@/shared/itemEquipLevel";
import { MAX_QUALITY_CRAFT_USES } from "@/shared/equipmentQuality";
import { ITEM_LEVEL_DEFAULT } from "@/shared/equipmentItemLevel";
import { equipmentSetSubtitle } from "@/shared/equipmentSets";
import type { ReactNode } from "react";

export function WeaponTooltipContent({ weapon }: { weapon: WeaponTooltipData }) {
  const grade = weaponGradeIndex(weapon);
  const baseAtkMagic = weaponBaseAtkMagic(weapon.baseItemId);
  const base = weaponBasePower(weapon.baseItemId);
  const enhance = weaponEnhancePowerBonus(weapon.baseItemId, weapon.enhanceLevel);
  const optBonus = weaponOptionPowerBonus(weapon.options);
  const total = weaponTotalPower(weapon);
  const weaponOpts = weapon.options ?? [];
  const equipReq = requiredEquipLevelForInstance(weapon.baseItemId, grade, weapon.itemLevel);
  const quality = weapon.quality ?? 0;
  const itemLevel = weapon.itemLevel ?? ITEM_LEVEL_DEFAULT;

  const setLine = equipmentSetSubtitle(weapon.baseItemId);

  return (
    <div className={`item-tooltip item-tooltip--grade-${grade}`}>
      <div className="item-tooltip__name">{weaponDisplayName(weapon)}</div>
      <div className="item-tooltip__category">
        {setLine ?? `무기 · ${weaponGradeLabel(weapon)}`}
      </div>
      {equipReq > 1 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>착용 레벨</span>
          <span>Lv {equipReq}+</span>
        </div>
      ) : null}
      {quality > 0 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>품질</span>
          <span>
            {quality}
            {(weapon.qualityCraftCount ?? 0) > 0 ? ` · 연마 ${weapon.qualityCraftCount}/${MAX_QUALITY_CRAFT_USES}` : ""}
          </span>
        </div>
      ) : null}
      {itemLevel > ITEM_LEVEL_DEFAULT ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>아이템 레벨</span>
          <span>Lv {itemLevel}</span>
        </div>
      ) : null}

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
          <span>제련 (+{weapon.enhanceLevel})</span>
          <span>+{enhance}</span>
        </div>
      ) : null}
      {weapon.identified !== false && optBonus > 0 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>옵션 합</span>
          <span>+{optBonus}</span>
        </div>
      ) : null}

      {weapon.identified === false && weaponOpts.length > 0 ? (
        <>
          <EquipmentBlessingOptionRows options={weaponOpts} identified={false} />
          <p className="item-tooltip__desc item-tooltip__desc--muted">
            미감정 · 감정 주문서로 옵션 확인
          </p>
        </>
      ) : null}

      {weapon.identified !== false && weaponOpts.length > 0 ? (
        <EquipmentBlessingOptionRows options={weaponOpts} identified />
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
