"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import {
  ENHANCE_MANA_STONE_ITEM_IDS,
  ENHANCE_MANA_STONE_SHORT_LABELS,
  enhanceManaStoneLabel,
  type EnhanceManaStoneItemId,
  enhanceManaStoneTierIndex,
  eligibleManaStonesForRequirement,
} from "@/server/weaponUpgradeRules";

type Props = {
  requiredItemId: string;
  requiredQty: number;
  selectedId: EnhanceManaStoneItemId | null;
  onSelect: (itemId: EnhanceManaStoneItemId) => void;
  stackQty: (itemId: string) => number;
  itemName?: (itemId: string) => string;
  disabled?: boolean;
  compact?: boolean;
};

function labelFor(itemId: EnhanceManaStoneItemId, itemName?: (id: string) => string, compact?: boolean) {
  if (compact) return ENHANCE_MANA_STONE_SHORT_LABELS[itemId];
  return itemName?.(itemId) ?? enhanceManaStoneLabel(itemId);
}

export function ForgeManaStonePicker(props: Props) {
  const eligible = eligibleManaStonesForRequirement(
    props.requiredItemId,
    props.requiredQty,
    props.stackQty,
  );
  const requiredTier = enhanceManaStoneTierIndex(props.requiredItemId);
  const requiredName = labelFor(
    props.requiredItemId as EnhanceManaStoneItemId,
    props.itemName,
    props.compact,
  );
  const selectedTier =
    props.selectedId != null ? enhanceManaStoneTierIndex(props.selectedId) : -1;
  const usingHigherTier = props.selectedId != null && selectedTier > requiredTier;

  return (
    <div className={`forge-mana-picker ${props.compact ? "forge-mana-picker--compact" : ""}`.trim()}>
      <div className="forge-mana-picker__head">
        <p className="forge-mana-picker__title">마석 선택</p>
        {!props.compact ? (
          <p className="forge-mana-picker__req">
            필요 {enhanceManaStoneLabel(props.requiredItemId)} ×{props.requiredQty}
          </p>
        ) : null}
      </div>
      <div className="forge-mana-picker__grid" role="radiogroup" aria-label="강화 마석 선택">
        {ENHANCE_MANA_STONE_ITEM_IDS.map((itemId) => {
          const canUse = eligible.includes(itemId);
          const active = props.selectedId === itemId;
          const tier = enhanceManaStoneTierIndex(itemId);
          const isHigher = tier > requiredTier;
          const qty = props.stackQty(itemId);
          return (
            <button
              key={itemId}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={props.disabled || !canUse}
              className={`forge-mana-picker__cell ${active ? "forge-mana-picker__cell--active" : ""} ${!canUse ? "forge-mana-picker__cell--disabled" : ""} ${isHigher && canUse ? "forge-mana-picker__cell--higher" : ""}`.trim()}
              onClick={() => props.onSelect(itemId)}
              title={`${enhanceManaStoneLabel(itemId)} · 보유 ${qty}`}
            >
              <ItemIcon itemId={itemId} size={props.compact ? 32 : 36} className="item-icon forge-mana-picker__icon" />
              <span className="forge-mana-picker__label">
                {labelFor(itemId, props.itemName, props.compact)}
              </span>
              <span className="forge-mana-picker__qty">{qty}</span>
              {isHigher && canUse ? (
                <span className="forge-mana-picker__tag">상위</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {eligible.length === 0 ? (
        <p className="forge-mana-picker__hint forge-mana-picker__hint--warn">
          사용 가능한 마석이 없어요.
        </p>
      ) : props.selectedId == null ? (
        <p className="forge-mana-picker__hint forge-mana-picker__hint--warn">마석을 선택해 주세요.</p>
      ) : usingHigherTier ? (
        <p className="forge-mana-picker__hint forge-mana-picker__hint--warn">
          {requiredName} 대신 {enhanceManaStoneLabel(props.selectedId)} {props.requiredQty}개를 씁니다.
        </p>
      ) : props.compact ? null : (
        <p className="forge-mana-picker__hint">
          {enhanceManaStoneLabel(props.selectedId)} ×{props.requiredQty} 사용
        </p>
      )}
    </div>
  );
}
