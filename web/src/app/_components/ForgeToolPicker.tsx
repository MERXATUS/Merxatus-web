"use client";

import { ItemIcon } from "@/app/_components/ItemIcon";
import { StackItemTooltipHover } from "@/app/_components/StackItemTooltip";
import { GameBtn } from "@/app/_components/gameUi";
import { CRAFTING_ITEM_GRADE } from "@/shared/craftingItemDrops";
import type { ForgeToolDef } from "@/shared/forgeWorkbench";
import { shouldShowStackItemTooltip, type StackItemTooltipData } from "@/shared/stackItemTooltip";

export type ForgeEquipTarget = { kind: "weapon" | "armor"; id: string };

export function ForgeToolPicker(props: {
  tools: ForgeToolDef[];
  inventory: Array<{ itemId: string; name: string; quantity: number }>;
  selectedToolId: string | null;
  onSelectTool: (itemId: string | null) => void;
  selectedEquip: ForgeEquipTarget | null;
  targetLabel: string | null;
  transferTargetLabel?: string | null;
  needsTransferTarget?: boolean;
  onApply: () => void;
  onAppraiseAll?: () => void;
  unidentifiedCount?: number;
  appraisalScrollQty?: number;
  busy: boolean;
  compact?: boolean;
  layout?: "inline" | "rail";
}) {
  const qtyById = new Map(props.inventory.map((x) => [x.itemId, x.quantity]));
  const activeTool = props.tools.find((t) => t.itemId === props.selectedToolId) ?? null;
  const isRail = props.layout === "rail";

  return (
    <aside
      className={`forge-tool-picker ${props.compact ? "forge-tool-picker--compact" : ""} ${isRail ? "forge-tool-picker--rail forge-material-rail" : ""}`}
    >
      <div className={isRail ? "forge-rail__head" : undefined}>
        <p className={isRail ? "forge-rail__title" : "forge-tool-picker__title"}>가공 도구</p>
      </div>
      <div className={`forge-tool-picker__grid ${isRail ? "forge-material-grid forge-tool-grid--rail" : ""}`}>
        {props.tools.map((tool) => {
          const qty = qtyById.get(tool.itemId) ?? 0;
          const active = props.selectedToolId === tool.itemId;
          const name = props.inventory.find((x) => x.itemId === tool.itemId)?.name ?? tool.label;
          const tooltipItem: StackItemTooltipData = {
            itemId: tool.itemId,
            name,
            category: "재료",
            grade: CRAFTING_ITEM_GRADE[tool.itemId],
            quantity: qty,
          };
          const button = (
            <button
              type="button"
              disabled={props.busy}
              aria-label={name}
              className={`forge-tool-card ${isRail ? "forge-material-cell forge-tool-cell--rail" : ""} ${active ? "forge-tool-card--active forge-material-cell--active" : ""} ${qty < 1 ? "forge-tool-card--empty" : ""}`}
              onClick={() => props.onSelectTool(active ? null : tool.itemId)}
            >
              {isRail ? (
                <ItemIcon itemId={tool.itemId} size={40} className="item-icon forge-material-cell__icon" />
              ) : (
                <span className="forge-tool-card__glyph" aria-hidden>
                  {tool.glyph}
                </span>
              )}
              <span className={isRail ? "forge-material-cell__label" : "forge-tool-card__name"}>
                {tool.shortLabel}
              </span>
              <span className={isRail ? "forge-material-cell__qty" : "forge-tool-card__qty"}>×{qty}</span>
              {!props.compact && !isRail ? (
                <span className="forge-tool-card__full-name">{name}</span>
              ) : null}
            </button>
          );
          return shouldShowStackItemTooltip(tooltipItem) ? (
            <StackItemTooltipHover key={tool.itemId} item={tooltipItem} detailsOnly>
              {button}
            </StackItemTooltipHover>
          ) : (
            <span key={tool.itemId} className="forge-tool-card-wrap">
              {button}
            </span>
          );
        })}
      </div>

      {activeTool ? (
        <div className="forge-tool-picker__detail">
          <p className="forge-tool-picker__detail-name">{activeTool.label}</p>
          {(qtyById.get(activeTool.itemId) ?? 0) < 1 ? (
            <p className="forge-tool-picker__detail-warn">보유하지 않음 — 설명만 확인할 수 있어요.</p>
          ) : null}
          <p className="forge-tool-picker__detail-desc">{activeTool.description}</p>
          <p className="forge-tool-picker__detail-hint">{activeTool.hint}</p>
        </div>
      ) : (
        <p className="forge-tool-picker__hint">사용할 도구를 선택하세요.</p>
      )}

      <p className="forge-tool-picker__target">
        {props.selectedEquip
          ? `원본: ${props.targetLabel ?? props.selectedEquip.id}`
          : isRail
            ? "오른쪽에서 가공 도구를 선택하세요."
            : "목록에서 무기·방어구를 먼저 선택하세요."}
      </p>
      {props.needsTransferTarget ? (
        <p className="forge-tool-picker__target">
          {props.transferTargetLabel
            ? `전이 대상: ${props.transferTargetLabel}`
            : "같은 등급·부위의 전이 받을 장비를 선택하세요."}
        </p>
      ) : null}

      <div className={`forge-tool-picker__actions ${isRail ? "forge-material-rail__footer" : ""}`}>
        {props.onAppraiseAll != null ? (
          <GameBtn variant="ghost" disabled={props.busy} onClick={() => props.onAppraiseAll?.()}>
            전체 감정 ({props.unidentifiedCount ?? 0})
          </GameBtn>
        ) : null}
        <GameBtn
          variant="primary"
          disabled={
            props.busy ||
            !props.selectedEquip ||
            !props.selectedToolId ||
            (qtyById.get(props.selectedToolId) ?? 0) < 1 ||
            (props.needsTransferTarget && !props.transferTargetLabel)
          }
          onClick={() => props.onApply()}
        >
          {props.busy
            ? "적용 중…"
            : activeTool
              ? `${activeTool.shortLabel} 사용`
              : "도구 사용"}
        </GameBtn>
      </div>
      {(props.unidentifiedCount ?? 0) > 0 ? (
        <p className="forge-tool-picker__hint">
          미감정 {props.unidentifiedCount}개 · 감정 주문서 ×{props.appraisalScrollQty ?? 0}
          {(props.appraisalScrollQty ?? 0) < (props.unidentifiedCount ?? 0) ? " (부족)" : ""}
        </p>
      ) : null}
    </aside>
  );
}

export function renderForgeOptionChips(
  options: Array<{
    kind: string;
    label: string;
    tierLabel: string;
    displayValue: number;
    hidden?: boolean;
    locked?: boolean;
  }>,
  tone: "weapon" | "armor",
  opts?: { maxVisible?: number },
) {
  if (options.length === 0) {
    return <p className="forge-equip-options__empty text-xs text-[var(--game-muted)]">옵션 없음</p>;
  }
  const cls = tone === "weapon" ? "forge-option-chip--weapon" : "forge-option-chip--armor";
  const maxVisible = Math.max(0, Math.floor(opts?.maxVisible ?? 0));
  const visible = maxVisible > 0 ? options.slice(0, maxVisible) : options;
  const hiddenCount = Math.max(0, options.length - visible.length);
  const moreTitle =
    hiddenCount > 0
      ? options
          .slice(visible.length)
          .map((op) => (op.hidden ? "미감정" : `${op.label} ${op.displayValue >= 0 ? "+" : ""}${op.displayValue} (${op.tierLabel})${op.locked ? " · 봉인" : ""}`))
          .join("\n")
      : "";
  return (
    <div className="forge-equip-options">
      {visible.map((op, i) => (
        <span
          key={`${op.kind}-${i}`}
          className={`forge-option-chip ${cls}`}
          title={op.hidden ? "미감정" : `${op.label} · ${op.tierLabel}${op.locked ? " · 봉인" : ""}`}
        >
          <span className="forge-option-chip__tier">{op.hidden ? "?" : op.tierLabel}</span>
          <span className="forge-option-chip__label">{op.hidden ? "???" : op.label}</span>
          {!op.hidden ? (
            <span className="forge-option-chip__val">
              {op.displayValue >= 0 ? "+" : ""}
              {op.displayValue}
            </span>
          ) : null}
          {op.locked ? <span className="forge-option-chip__lock" aria-hidden>🔒</span> : null}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className={`forge-option-chip ${cls} forge-option-chip--more`} title={moreTitle}>
          <span className="forge-option-chip__tier">+</span>
          <span className="forge-option-chip__label">{hiddenCount}개 더</span>
        </span>
      ) : null}
    </div>
  );
}
