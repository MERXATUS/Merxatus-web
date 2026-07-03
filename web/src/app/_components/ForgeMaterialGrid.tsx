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
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export function ForgeMaterialGrid(props: {
  title: string;
  cells: ForgeMaterialCell[];
  footer?: ReactNode;
  emptyMessage?: string;
  className?: string;
  clickToToggle?: boolean;
}) {
  const railClassName = ["forge-material-rail", props.className].filter(Boolean).join(" ");
  return (
    <aside className={railClassName}>
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
            const selectable = Boolean(cell.onClick);
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
            const cellClassName = [
              "forge-material-cell",
              cell.isGold ? "forge-material-cell--gold" : "",
              short ? "forge-material-cell--short" : "",
              cell.selected ? "forge-material-cell--active" : "",
              cell.disabled ? "forge-material-cell--disabled" : "",
              showTooltip ? "forge-material-cell--tooltip" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const cellContent = (
              <>
                {cell.isGold ? (
                  <span className="forge-material-cell__gold-icon" aria-hidden>
                    G
                  </span>
                ) : cell.itemId ? (
                  <ItemIcon itemId={cell.itemId} size={32} className="item-icon forge-material-cell__icon" />
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
              </>
            );
            const cellBody = selectable ? (
              <button
                type="button"
                className={cellClassName}
                onClick={cell.onClick}
                disabled={cell.disabled}
                title={showTooltip ? undefined : (cell.hint ?? cell.label)}
                aria-label={cell.label}
                aria-pressed={cell.selected ?? false}
              >
                {cellContent}
              </button>
            ) : (
              <div
                className={cellClassName}
                title={showTooltip ? undefined : (cell.hint ?? cell.label)}
                aria-label={cell.label}
              >
                {cellContent}
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
                  <StackItemTooltipHover
                    key={cell.key}
                    item={tooltipItem}
                    detailsOnly
                    clickToToggle={selectable ? false : props.clickToToggle}
                  >
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
