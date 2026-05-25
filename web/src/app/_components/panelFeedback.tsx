"use client";

import type { ReactNode } from "react";
import { formatPanelError } from "@/shared/formatPanelError";

export function GamePanelError(props: { error: unknown; className?: string }) {
  return (
    <div
      className={`game-panel-error ${props.className ?? ""}`.trim()}
      role="alert"
    >
      {formatPanelError(props.error)}
    </div>
  );
}

export function GamePanelLoading(props: { label?: string; className?: string }) {
  return (
    <div className={`game-panel-loading ${props.className ?? ""}`.trim()} role="status" aria-live="polite">
      <span className="game-panel-loading__spinner" aria-hidden />
      <span>{props.label ?? "불러오는 중…"}</span>
    </div>
  );
}

export function GamePanelInfo(props: { children: ReactNode; className?: string }) {
  return <div className={`game-panel-info ${props.className ?? ""}`.trim()}>{props.children}</div>;
}
