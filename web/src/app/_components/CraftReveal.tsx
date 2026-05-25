"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import { useEscapeClose } from "@/shared/useEscapeClose";

export type CraftRevealCard = {
  itemId: string;
  itemName: string;
  category?: string;
  qty: number;
  instanceId?: string;
};

export function CraftReveal(props: {
  recipeName: string;
  cards: CraftRevealCard[];
  onClose: () => void;
}) {
  const { recipeName, cards, onClose } = props;
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

  const isWeapon = (c: CraftRevealCard) => c.category === "무기" || c.itemId.startsWith("weapon_");
  const isTool = (c: CraftRevealCard) => c.category === "도구" || c.itemId.startsWith("tool_");
  const weapons = cards.filter(isWeapon);
  const tools = cards.filter(isTool);
  const materials = cards.filter((c) => !isWeapon(c) && !isTool(c));
  const featured = weapons.length > 0 ? weapons : tools.length > 0 ? tools : cards;

  const ui = (
    <div
      className="craft-reveal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="craft-reveal-title"
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
              <p className="craft-reveal-summon__label">제작 완료!</p>
              <p className="craft-reveal-summon__recipe">{recipeName}</p>
            </div>
          ) : (
            <>
              <p id="craft-reveal-title" className="craft-reveal-card__eyebrow">
                제작 성공
              </p>
              <p className="craft-reveal-card__recipe">{recipeName}</p>

              <div className="craft-reveal-featured">
                {featured.map((c) => (
                  <div key={c.itemId} className="craft-reveal-featured__item">
                    <div className="craft-reveal-featured__icon">
                      <ItemIcon itemId={c.itemId} size={96} />
                    </div>
                    <p className="craft-reveal-featured__name">{c.itemName}</p>
                    <p className="craft-reveal-featured__qty">×{c.qty.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {materials.length > 0 ? (
                <div className="craft-reveal-materials">
                  <p className="craft-reveal-materials__label">함께 획득</p>
                  <div className="craft-reveal-materials__grid">
                    {materials.map((c) => (
                      <div key={c.itemId} className="craft-reveal-materials__chip">
                        <ItemIcon itemId={c.itemId} size={40} />
                        <span className="truncate">{c.itemName}</span>
                        <span className="tabular-nums">×{c.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

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
