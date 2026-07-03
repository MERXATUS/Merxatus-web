"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** 강화 1회당 연출 시간(초) — 아이콘 위 인라인 */
export const ENHANCE_MOTION_SECONDS = 0.2;

export type EnhanceBurstVariant = "success" | "fail";

type Props = {
  active: boolean;
  variant: EnhanceBurstVariant;
  onComplete: () => void;
  children: ReactNode;
  className?: string;
};

/** 무기 아이콘 위 폭발 연출 (전체 화면 오버레이 없음) */
export function EnhanceItemBurst(props: Props) {
  const { active, variant, onComplete, children, className } = props;
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) {
      doneRef.current = false;
      return;
    }
    doneRef.current = false;
    const durationMs = ENHANCE_MOTION_SECONDS * 1000;
    const t = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onCompleteRef.current();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [active, variant]);

  const rootClass = [
    "enhance-item-burst",
    active ? "enhance-item-burst--active" : "",
    active && variant === "fail" ? "enhance-item-burst--fail" : "",
    active && variant === "success" ? "enhance-item-burst--success" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="enhance-item-burst__icon">{children}</div>
      {active ? (
        <div key={`burst-fx-${variant}`} className="enhance-item-burst__fx" aria-hidden>
          <span className="enhance-item-burst__glow" />
          <span className="enhance-item-burst__flash" />
          <span className="enhance-item-burst__shockwave" />
          <span className="enhance-item-burst__ring" />
          <span className="enhance-item-burst__core" />
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="enhance-item-burst__spark" style={{ ["--i" as string]: i }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
