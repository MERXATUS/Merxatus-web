"use client";

import { ItemTooltipHover } from "@/app/_components/ItemTooltipHover";
import {
  stackItemGradeIndex,
  stackItemTooltipBodyLines,
  stackItemTooltipSubtitle,
  type StackItemTooltipData,
} from "@/shared/stackItemTooltip";
import { isArmorInventoryItem } from "@/shared/armorStatsData";
import { isAccessoryInventoryItem } from "@/shared/accessoryCatalog";
import { minEquipLevelForItem } from "@/shared/itemEquipLevel";
import type { ReactNode } from "react";

function fmtQty(n: number) {
  return Number.isFinite(n) ? Math.floor(n).toLocaleString("ko-KR") : "0";
}

export function StackItemTooltipContent({
  item,
  detailsOnly,
}: {
  item: StackItemTooltipData;
  /** 이름·등급 헤더 없이 설명만 (강화소 재료 칸 등) */
  detailsOnly?: boolean;
}) {
  const grade = stackItemGradeIndex(item);
  const bodyLines = stackItemTooltipBodyLines(item);
  const equipLevel =
    isArmorInventoryItem(item) || isAccessoryInventoryItem(item)
      ? minEquipLevelForItem(item.itemId, item.grade)
      : 1;

  if (detailsOnly) {
    return (
      <div className={`item-tooltip item-tooltip--grade-${grade} item-tooltip--details-only`}>
        {bodyLines.map((line, i) => (
          <div key={i} className="item-tooltip__desc">
            {line}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`item-tooltip item-tooltip--grade-${grade}`}>
      <div className="item-tooltip__name">{item.name}</div>
      <div className="item-tooltip__category">{stackItemTooltipSubtitle(item)}</div>
      {equipLevel > 1 ? (
        <div className="item-tooltip__stat-row item-tooltip__stat-row--sub">
          <span>착용 레벨</span>
          <span>Lv {equipLevel}+</span>
        </div>
      ) : null}

      <div className="item-tooltip__divider" />

      {bodyLines.map((line, i) => (
        <div key={i} className="item-tooltip__desc">
          {line}
        </div>
      ))}

      {typeof item.quantity === "number" && item.quantity > 0 ? (
        <>
          <div className="item-tooltip__divider" />
          <div className="item-tooltip__stat-row">
            <span>보유 수량</span>
            <span className="item-tooltip__stat-val">{fmtQty(item.quantity)}</span>
          </div>
        </>
      ) : null}

      <div className="item-tooltip__footer">{item.itemId}</div>
    </div>
  );
}

export function StackItemTooltipHover(props: {
  item: StackItemTooltipData;
  children: ReactNode;
  delayMs?: number;
  detailsOnly?: boolean;
}) {
  const { item, children, delayMs, detailsOnly } = props;
  return (
    <ItemTooltipHover
      content={<StackItemTooltipContent item={item} detailsOnly={detailsOnly} />}
      delayMs={delayMs}
    >
      {children}
    </ItemTooltipHover>
  );
}
