"use client";

import type { ReactNode } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { CRAFTING_ITEM_GRADE } from "@/shared/craftingItemDrops";
import { shouldShowStackItemTooltip } from "@/shared/stackItemTooltip";

export type ForgeMaterialCell = {
  key: string;
  itemId?: string;
  label: string;
  quantity: number;
  required?: number;
  hint?: string;
  isGold?: boolean;
};

export function ForgeMaterialGrid(props: {
  title: string;
  cells: ForgeMaterialCell[];
  footer?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <aside className="forge-material-rail">
      <div className="forge-rail__head">
        <p className="forge-rail__title">{props.title}</p>
      </div>
      <div className="forge-material-grid">
        {props.cells.length === 0 ? (
          <p className="forge-rail__empty">{props.emptyMessage ?? "없음"}</p>
        ) : (
          props.cells.map((cell) => {
            const short =
              cell.required != null && cell.quantity < cell.required;
            const showTooltip = Boolean(
              cell.itemId &&
                shouldShowStackItemTooltip({
                  itemId: cell.itemId,
                  name: cell.label,
                  category: "재료",
                  grade: CRAFTING_ITEM_GRADE[cell.itemId],
                  quantity: cell.quantity,
                }),
            );
            const cellBody = (
              <div
                className={`forge-material-cell ${cell.isGold ? "forge-material-cell--gold" : ""} ${short ? "forge-material-cell--short" : ""}`}
                title={showTooltip ? undefined : (cell.hint ?? cell.label)}
                aria-label={cell.label}
              >
                {cell.isGold ? (
                  <span className="forge-material-cell__gold-icon" aria-hidden>
                    G
                  </span>
                ) : cell.itemId ? (
                  <ItemIcon itemId={cell.itemId} size={40} className="item-icon forge-material-cell__icon" />
                ) : null}
                <span className="forge-material-cell__label">{cell.label}</span>
                <span className="forge-material-cell__qty">
                  {cell.required != null ? (
                    <>
                      <span className={short ? "forge-material-cell__qty-now--warn" : ""}>
                        {cell.quantity}
                      </span>
                      <span className="forge-material-cell__qty-sep">/</span>
                      {cell.required}
                    </>
                  ) : (
                    cell.quantity
                  )}
                </span>
              </div>
            );
            if (cell.itemId) {
              const tooltipItem = {
                itemId: cell.itemId,
                name: cell.label,
                category: "재료",
                grade: CRAFTING_ITEM_GRADE[cell.itemId],
                quantity: cell.quantity,
              };
              if (shouldShowStackItemTooltip(tooltipItem)) {
                return (
                  <StackItemTooltipHover key={cell.key} item={tooltipItem} detailsOnly>
                    {cellBody}
                  </StackItemTooltipHover>
                );
              }
            }
            return (
              <span key={cell.key} className="forge-material-cell-wrap">
                {cellBody}
              </span>
            );
          })
        )}
      </div>
      {props.footer ? <div className="forge-material-rail__footer">{props.footer}</div> : null}
    </aside>
  );
}
