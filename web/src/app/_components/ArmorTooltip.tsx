"use client";

import { ItemTooltipHover } from "@/app/_components/ItemTooltipHover";
import { EquipmentBlessingOptionRows } from "@/app/_components/EquipmentBlessingOptionRows";
import { armorSlotLabelKo } from "@/shared/armorStatsData";
import {
  armorBaseHpDef,
  armorDisplayName,
  armorEnhanceHpDefBonus,
  armorEnhancePowerBonus,
  armorGradeIndex,
  armorGradeLabel,
  armorOptionHpDefBonus,
  armorTotalPower,
  type ArmorTooltipData,
} from "@/shared/armorTooltip";
import { requiredEquipLevelForInstance } from "@/shared/itemEquipLevel";
import { MAX_QUALITY_CRAFT_USES } from "@/shared/equipmentQuality";
import { ITEM_LEVEL_DEFAULT } from "@/shared/equipmentItemLevel";
import { armorItemBaseStats } from "@/shared/equipmentItemBaseStats";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";
import { equipmentSetSubtitle } from "@/shared/equipmentSets";
import type { ReactNode } from "react";

export function ArmorTooltipContent({ armor }: { armor: ArmorTooltipData }) {
  const grade = armorGradeIndex(armor);
  const base = armorBaseHpDef(armor.baseItemId);
  const enhanceLv = armor.enhanceLevel ?? 0;
  const enhanceHpDef = base ? armorEnhanceHpDefBonus(enhanceLv, base.hp, base.def) : { hp: 0, def: 0 };
  const optBonus = base ? armorOptionHpDefBonus(armor.options, base.hp, base.def) : { hp: 0, def: 0 };
  const enhancePower = armorEnhancePowerBonus(armor.baseItemId, enhanceLv);
  const total = armorTotalPower(armor);
  const armorOpts = armor.options ?? [];
  const equipReq = requiredEquipLevelForInstance(armor.baseItemId, grade, armor.itemLevel);
  const quality = armor.quality ?? 0;
  const itemLevel = armor.itemLevel ?? ITEM_LEVEL_DEFAULT;
  const slotLabel = base ? armorSlotLabelKo(base.slot) : null;
  const itemBases = armorItemBaseStats(armor.baseItemId);
  const setLine = equipmentSetSubtitle(armor.baseItemId);

  return (
    <div className={`item-tooltip item-tooltip--grade-${grade}`}>
      <div className="item-tooltip__name">{armorDisplayName(armor)}</div>
      <div className="item-tooltip__category">
        {setLine ? `${setLine}${slotLabel ? ` · ${slotLabel}` : ""}` : `방어구 · ${armorGradeLabel(armor)}${slotLabel ? ` · ${slotLabel}` : ""}`}
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
            {(armor.qualityCraftCount ?? 0) > 0 ? ` · 연마 ${armor.qualityCraftCount}/${MAX_QUALITY_CRAFT_USES}` : ""}
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

      {base ? (
        <>
          <div className="item-tooltip__stat-row">
            <span>HP</span>
            <span className="item-tooltip__stat-val">{base.hp + enhanceHpDef.hp}</span>
          </div>
          <div className="item-tooltip__stat-row">
            <span>DEF</span>
            <span className="item-tooltip__stat-val">{base.def + enhanceHpDef.def}</span>
          </div>
          {itemBases
            ? MINION_STAT_KEYS.filter((key) => itemBases[key] > 0).map((key) => (
                <div key={key} className="item-tooltip__stat-row">
                  <span>{MINION_STAT_LABELS[key]}</span>
                  <span className="item-tooltip__stat-val">{itemBases[key]}</span>
                </div>
              ))
            : null}
          {enhanceLv > 0 ? (
            <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
              <span>제련 (+{enhanceLv})</span>
              <span>
                HP+{enhanceHpDef.hp} DEF+{enhanceHpDef.def}
              </span>
            </div>
          ) : null}
          <div className="item-tooltip__divider" />
        </>
      ) : null}

      <div className="item-tooltip__stat-row">
        <span>전투력</span>
        <span className="item-tooltip__stat-val">{total}</span>
      </div>
      {armor.identified !== false && (optBonus.hp > 0 || optBonus.def > 0) ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>옵션 보너스</span>
          <span>
            {optBonus.hp > 0 ? `HP+${optBonus.hp}` : ""}
            {optBonus.hp > 0 && optBonus.def > 0 ? " · " : ""}
            {optBonus.def > 0 ? `DEF+${optBonus.def}` : ""}
          </span>
        </div>
      ) : null}
      {enhancePower > 0 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>제련 전투력</span>
          <span>+{enhancePower}</span>
        </div>
      ) : null}

      {armor.identified === false && armorOpts.length > 0 ? (
        <>
          <EquipmentBlessingOptionRows options={armorOpts} identified={false} />
          <p className="item-tooltip__desc item-tooltip__desc--muted">
            미감정 · 감정 주문서로 옵션 확인
          </p>
        </>
      ) : null}

      {armor.identified !== false && armorOpts.length > 0 ? (
        <EquipmentBlessingOptionRows options={armorOpts} identified />
      ) : null}

      <div className="item-tooltip__footer">ID {armor.id.slice(0, 12)}…</div>
    </div>
  );
}

export function ArmorTooltipHover(props: {
  armor: ArmorTooltipData;
  children: ReactNode;
  delayMs?: number;
}) {
  const { armor, children, delayMs } = props;
  return (
    <ItemTooltipHover content={<ArmorTooltipContent armor={armor} />} delayMs={delayMs}>
      {children}
    </ItemTooltipHover>
  );
}
