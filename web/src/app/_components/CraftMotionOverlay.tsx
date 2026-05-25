"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 아이템 1개당 제작 연출 시간(초) */
export const CRAFT_MOTION_SECONDS_PER_ITEM = 3;

function formatMotionCountdown(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ForgeHammerIcon() {
  return (
    <svg
      className="craft-motion-svg"
      viewBox="0 0 120 72"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="60" cy="62" rx="34" ry="5" fill="rgba(0,0,0,0.35)" />
      <path
        d="M28 48h64c2 0 4 2 4 5v4c0 2-1 4-4 4H28c-2 0-4-2-4-4v-4c0-3 2-5 4-5z"
        fill="#3d4659"
      />
      <path
        d="M36 44h48c3 0 5 2 5 5v3H31v-3c0-3 2-5 5-5z"
        fill="#5a6478"
      />
      <path d="M42 40h36v4H42z" fill="#6b7589" />
      <g className="craft-motion-hammer-arm">
        <rect x="18" y="8" width="7" height="34" rx="2" fill="#6b4423" />
        <rect x="14" y="4" width="22" height="14" rx="3" fill="#b8c2d4" />
        <rect x="12" y="2" width="26" height="10" rx="2" fill="#dce4f0" />
        <path
          d="M12 2h26l-2 6H14z"
          fill="rgba(255,255,255,0.25)"
        />
      </g>
    </svg>
  );
}

export function CraftMotionOverlay(props: {
  active: boolean;
  recipeName: string;
  quantity: number;
  onComplete: () => void;
}) {
  const { active, recipeName, quantity, onComplete } = props;
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      setRemainingSec(0);
      doneRef.current = false;
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    doneRef.current = false;
    let cancelled = false;
    const durationMs = Math.max(1, quantity) * CRAFT_MOTION_SECONDS_PER_ITEM * 1000;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const p = Math.min(1, elapsed / durationMs);
      setProgress(p);
      setRemainingSec(Math.max(0, (durationMs - elapsed) / 1000));

      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!doneRef.current) {
        doneRef.current = true;
        document.body.style.overflow = "";
        onCompleteRef.current();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
    };
  }, [active, quantity]);

  if (!active || !mounted) return null;

  const ui = (
    <div className="craft-motion-backdrop" role="dialog" aria-modal="true" aria-labelledby="craft-motion-title">
      <div className="craft-motion-stage">
        <div className="craft-motion-glow" aria-hidden />
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="craft-motion-spark" style={{ ["--i" as string]: i }} aria-hidden />
        ))}

        <div className="craft-motion-card">
          <p id="craft-motion-title" className="craft-motion-card__label">
            제작 중…
          </p>
          <p className="craft-motion-card__recipe">{recipeName}</p>
          <p className="craft-motion-card__qty">×{quantity}</p>

          <div className="craft-motion-forge" aria-hidden>
            <ForgeHammerIcon />
            <div className="craft-motion-impact" />
          </div>

          <div className="craft-motion-progress">
            <div className="craft-motion-progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="craft-motion-card__time tabular-nums">{formatMotionCountdown(remainingSec)}</p>
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
