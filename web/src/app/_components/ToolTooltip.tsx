"use client";

import { ItemTooltipHover } from "@/app/_components/ItemTooltipHover";
import {
  toolDisplayName,
  toolGradeIndex,
  toolGradeLabel,
  toolTooltipOptions,
  type ToolTooltipData,
} from "@/shared/toolTooltip";
import type { ReactNode } from "react";

export function ToolTooltipContent({ tool }: { tool: ToolTooltipData }) {
  const grade = toolGradeIndex(tool);
  const opts = toolTooltipOptions(tool);

  return (
    <div className={`item-tooltip item-tooltip--grade-${grade}`}>
      <div className="item-tooltip__name">{toolDisplayName(tool)}</div>
      <div className="item-tooltip__category">도구 · {toolGradeLabel(tool)}</div>

      <div className="item-tooltip__divider" />

      <div className="item-tooltip__desc">작업장·수집 시설에 장착해 쓰는 도구입니다.</div>

      {opts.length > 0 ? (
        <>
          <div className="item-tooltip__divider" />
          <div className="item-tooltip__section-label">추가 옵션</div>
          {opts.map((op, i) => (
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
      ) : (
        <div className="item-tooltip__desc item-tooltip__desc--muted">부여된 옵션이 없습니다.</div>
      )}

      <div className="item-tooltip__footer">ID {tool.id.slice(0, 12)}…</div>
    </div>
  );
}

export function ToolTooltipHover(props: { tool: ToolTooltipData; children: ReactNode; delayMs?: number }) {
  const { tool, children, delayMs } = props;
  return (
    <ItemTooltipHover content={<ToolTooltipContent tool={tool} />} delayMs={delayMs}>
      {children}
    </ItemTooltipHover>
  );
}
