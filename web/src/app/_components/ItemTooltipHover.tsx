"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

function clampTooltipPos(x: number, y: number, width: number, height: number) {
  const pad = 10;
  const maxX = typeof window !== "undefined" ? window.innerWidth - width - pad : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - height - pad : y;
  return {
    x: Math.max(pad, Math.min(x, maxX)),
    y: Math.max(pad, Math.min(y, maxY)),
  };
}

export function ItemTooltipHover(props: {
  content: ReactNode;
  children: ReactNode;
  delayMs?: number;
}) {
  const { content, children, delayMs = 280 } = props;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipSizeRef = useRef({ w: 240, h: 200 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const showAt = useCallback((clientX: number, clientY: number, anchorRect?: DOMRect) => {
    const { w, h } = tooltipSizeRef.current;
    let x = anchorRect ? anchorRect.right + 12 : clientX + 14;
    let y = anchorRect ? anchorRect.top : clientY + 14;
    if (typeof window !== "undefined" && anchorRect && x + w > window.innerWidth - 8) {
      x = anchorRect.left - w - 12;
    }
    const clamped = clampTooltipPos(x, y, w, h);
    setPos(clamped);
    setVisible(true);
  }, []);

  const scheduleShow = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const rect = e.currentTarget.getBoundingClientRect();
      timerRef.current = setTimeout(() => showAt(e.clientX, e.clientY, rect), delayMs);
    },
    [delayMs, showAt],
  );

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  }, []);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!visible) return;
      const rect = e.currentTarget.getBoundingClientRect();
      showAt(e.clientX, e.clientY, rect);
    },
    [visible, showAt],
  );

  const portal =
    visible && mounted ? (
      <div
        className="item-tooltip-portal"
        style={{ left: pos.x, top: pos.y }}
        role="tooltip"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={hide}
      >
        {content}
      </div>
    ) : null;

  return (
    <>
      <span
        className="item-tooltip-trigger inline-flex shrink-0"
        onMouseEnter={scheduleShow}
        onMouseLeave={hide}
        onMouseMove={onMove}
      >
        {children}
      </span>
      {mounted && portal ? createPortal(portal, document.body) : null}
    </>
  );
}
