"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ForgeHammerIcon } from "@/app/_components/CraftMotionOverlay";

/** 강화 1회당 연출 시간(초) */
export const ENHANCE_MOTION_SECONDS = 3;

function formatMotionCountdown(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function EnhanceMotionOverlay(props: {
  active: boolean;
  weaponName: string;
  fromLevel: number;
  toLevel: number;
  onComplete: () => void;
}) {
  const { active, weaponName, fromLevel, toLevel, onComplete } = props;
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
    const durationMs = ENHANCE_MOTION_SECONDS * 1000;
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
  }, [active]);

  if (!active || !mounted) return null;

  const ui = (
    <div className="craft-motion-backdrop" role="dialog" aria-modal="true" aria-labelledby="enhance-motion-title">
      <div className="craft-motion-stage">
        <div className="craft-motion-glow" aria-hidden />
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="craft-motion-spark" style={{ ["--i" as string]: i }} aria-hidden />
        ))}

        <div className="craft-motion-card">
          <p id="enhance-motion-title" className="craft-motion-card__label">
            강화 중…
          </p>
          <p className="craft-motion-card__recipe">{weaponName}</p>
          <p className="enhance-motion-level">
            <span>+{fromLevel}</span>
            <span className="enhance-motion-level__arrow">→</span>
            <span className="enhance-motion-level__next">+{toLevel}</span>
          </p>

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
