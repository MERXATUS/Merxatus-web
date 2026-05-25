"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { useEscapeClose } from "@/shared/useEscapeClose";

export function EnhanceReveal(props: {
  weaponName: string;
  baseItemId: string;
  fromLevel: number;
  toLevel: number;
  onClose: () => void;
}) {
  const { weaponName, baseItemId, fromLevel, toLevel, onClose } = props;
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"flash" | "reveal">("flash");

  useEscapeClose(true, onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("reveal"), 500);
    return () => window.clearTimeout(t);
  }, []);

  if (!mounted) return null;

  const ui = (
    <div
      className="craft-reveal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enhance-reveal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "reveal") onClose();
      }}
    >
      <div className={`craft-reveal-stage craft-reveal-stage--${phase}`}>
        <div className="craft-reveal-flash" aria-hidden />
        <div className="craft-reveal-rays" aria-hidden />
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="craft-reveal-spark" style={{ ["--i" as string]: i }} aria-hidden />
        ))}

        <div className="craft-reveal-card">
          {phase === "flash" ? (
            <div className="craft-reveal-summon">
              <p className="craft-reveal-summon__label">강화 성공!</p>
              <p className="craft-reveal-summon__recipe">{weaponName}</p>
            </div>
          ) : (
            <>
              <p id="enhance-reveal-title" className="craft-reveal-card__eyebrow">
                강화 완료
              </p>
              <p className="craft-reveal-card__recipe">{weaponName}</p>

              <div className="craft-reveal-featured">
                <div className="craft-reveal-featured__item">
                  <div className="craft-reveal-featured__icon">
                    <ItemIcon itemId={baseItemId} size={96} />
                  </div>
                  <p className="enhance-reveal-level enhance-reveal-level--large">
                    <span>+{fromLevel}</span>
                    <span className="enhance-motion-level__arrow">→</span>
                    <span className="enhance-motion-level__next">+{toLevel}</span>
                  </p>
                </div>
              </div>

              <div className="craft-reveal-card__actions">
                <GameBtn variant="gold" onClick={onClose}>
                  확인
                </GameBtn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
