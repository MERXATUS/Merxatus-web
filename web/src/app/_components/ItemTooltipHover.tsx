"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PAD = 10;
const GAP = 12;
const DEFAULT_SIZE = { w: 260, h: 220 };

function computeTooltipPos(anchor: DOMRect | null, size: { w: number; h: number }, pointer?: { x: number; y: number }) {
  if (typeof window === "undefined") {
    return { x: pointer?.x ?? 0, y: pointer?.y ?? 0 };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.min(size.w, vw - VIEWPORT_PAD * 2);
  const maxH = Math.min(size.h, vh - VIEWPORT_PAD * 2);

  let x: number;
  let y: number;

  if (anchor) {
    x = anchor.right + GAP;
    y = anchor.top;

    if (x + maxW > vw - VIEWPORT_PAD) {
      x = anchor.left - maxW - GAP;
    }
    if (x < VIEWPORT_PAD) {
      x = Math.max(VIEWPORT_PAD, Math.min(anchor.left, vw - maxW - VIEWPORT_PAD));
    }

    if (y + maxH > vh - VIEWPORT_PAD) {
      y = anchor.bottom - maxH;
    }
    if (y < VIEWPORT_PAD) {
      y = VIEWPORT_PAD;
    }
    if (y + maxH > vh - VIEWPORT_PAD) {
      y = vh - maxH - VIEWPORT_PAD;
    }
  } else if (pointer) {
    x = pointer.x + 14;
    y = pointer.y + 14;
    if (x + maxW > vw - VIEWPORT_PAD) x = pointer.x - maxW - 14;
    if (y + maxH > vh - VIEWPORT_PAD) y = pointer.y - maxH - 14;
    x = Math.max(VIEWPORT_PAD, Math.min(x, vw - maxW - VIEWPORT_PAD));
    y = Math.max(VIEWPORT_PAD, Math.min(y, vh - maxH - VIEWPORT_PAD));
  } else {
    x = VIEWPORT_PAD;
    y = VIEWPORT_PAD;
  }

  return { x, y };
}

export function ItemTooltipHover(props: {
  content: ReactNode;
  children: ReactNode;
  delayMs?: number;
  /** 모바일 등 — 클릭(탭)으로 설명 표시·닫기 */
  clickToToggle?: boolean;
}) {
  const { content, children, delayMs = 280, clickToToggle = false } = props;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const anchorRef = useRef<DOMRect | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reposition = useCallback(() => {
    const el = tooltipRef.current;
    const size = el
      ? { w: el.offsetWidth || DEFAULT_SIZE.w, h: el.offsetHeight || DEFAULT_SIZE.h }
      : DEFAULT_SIZE;
    setPos(computeTooltipPos(anchorRef.current, size, pointerRef.current ?? undefined));
  }, []);

  const showAt = useCallback(
    (clientX: number, clientY: number, anchorRect?: DOMRect) => {
      anchorRef.current = anchorRect ?? null;
      pointerRef.current = { x: clientX, y: clientY };
      setPos(computeTooltipPos(anchorRect ?? null, DEFAULT_SIZE, { x: clientX, y: clientY }));
      setVisible(true);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!visible) return;
    reposition();
  }, [visible, content, reposition]);

  useEffect(() => {
    if (!visible) return;
    const onReflow = () => reposition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [visible, reposition]);

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
    anchorRef.current = null;
    pointerRef.current = null;
    setVisible(false);
  }, []);

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!visible) return;
      const rect = e.currentTarget.getBoundingClientRect();
      anchorRef.current = rect;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      reposition();
    },
    [visible, reposition],
  );

  useEffect(() => {
    if (!clickToToggle || !visible) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [clickToToggle, visible, hide]);

  const onTriggerClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!clickToToggle) return;
      e.stopPropagation();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (visible) {
        hide();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      showAt(e.clientX, e.clientY, rect);
    },
    [clickToToggle, visible, hide, showAt],
  );

  const portal =
    visible && mounted ? (
      <div
        ref={tooltipRef}
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
        ref={triggerRef}
        className={`item-tooltip-trigger inline-flex shrink-0${clickToToggle ? " item-tooltip-trigger--click" : ""}`}
        onMouseEnter={clickToToggle ? undefined : scheduleShow}
        onMouseLeave={clickToToggle ? undefined : hide}
        onMouseMove={clickToToggle ? undefined : onMove}
        onClick={onTriggerClick}
      >
        {children}
      </span>
      {mounted && portal ? createPortal(portal, document.body) : null}
    </>
  );
}
