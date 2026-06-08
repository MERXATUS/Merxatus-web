"use client";

import { useEffect, useState } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import { GameBtn } from "@/app/_components/gameUi";
import {
  dispatchMinionRecruited,
  minionKindLabel,
  type MinionHatchResult,
} from "@/shared/minionRecruit";
import { MINION_STAT_KEYS, MINION_STAT_LABELS } from "@/shared/minionBaseStats";
import { useEscapeClose } from "@/shared/useEscapeClose";

export function MinionRecruitReveal(props: {
  result: MinionHatchResult;
  mode?: "recruit" | "create";
  onClose: () => void;
  onViewMinions?: () => void;
}) {
  const { result, onClose, onViewMinions, mode = "recruit" } = props;
  const isCreate = mode === "create";
  const [phase, setPhase] = useState<"summon" | "reveal">("summon");

  useEscapeClose(true, onClose);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase("reveal"), 850);
    return () => window.clearTimeout(t);
  }, []);

  const { minion, recruit, consumedItemId, icon, iconSrc } = result;

  return (
    <div
      className="minion-recruit-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="minion-recruit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && phase === "reveal") onClose();
      }}
    >
      <div className={`minion-recruit-stage minion-recruit-stage--${phase}`}>
        <div className="minion-recruit-flash" aria-hidden />
        <div className="minion-recruit-rays" aria-hidden />
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className="minion-recruit-spark" style={{ ["--i" as string]: i }} aria-hidden />
        ))}

        <div className="minion-recruit-card">
          {phase === "summon" ? (
            <div className="minion-recruit-summon">
              <p className="minion-recruit-summon__label">{isCreate ? "생성 중…" : "고용 중…"}</p>
              {!isCreate ? (
                <div className="minion-recruit-summon__icon">
                  <ItemIcon itemId={consumedItemId} icon={icon} iconSrc={iconSrc} size={72} />
                </div>
              ) : (
                <div className="minion-recruit-summon__icon minion-recruit-summon__icon--create" aria-hidden>
                  ✦
                </div>
              )}
            </div>
          ) : (
            <>
              <p id="minion-recruit-title" className="minion-recruit-card__eyebrow">
                {isCreate ? "새 캐릭터 생성!" : "새 미니언 고용!"}
              </p>
              <div className="minion-recruit-highlight" aria-label={`${minion.combatClassLabel} Lv${minion.level}`}>
                <p className="minion-recruit-highlight__job">{minion.combatClassLabel}</p>
                <p className="minion-recruit-highlight__level text-sm text-[var(--game-muted)]">Lv {minion.level}</p>
              </div>
              <div className="minion-recruit-card__stats" aria-label="기본 스탯">
                {MINION_STAT_KEYS.map((key) => (
                  <div key={key} className="minion-recruit-stat">
                    <span className="minion-recruit-stat__label">{MINION_STAT_LABELS[key]}</span>
                    <span className="minion-recruit-stat__value">{minion.baseStats[key]}</span>
                  </div>
                ))}
              </div>
              <p className="minion-recruit-card__meta">
                {minionKindLabel(recruit.minionKind)}
                {recruit.ticketNameKo ? ` · ${recruit.ticketNameKo}` : ""}
              </p>
              <div className="minion-recruit-card__actions">
                {onViewMinions ? (
                  <GameBtn variant="primary" onClick={onViewMinions}>
                    미니언 보기
                  </GameBtn>
                ) : (
                  <GameBtn
                    variant="primary"
                    onClick={() => {
                      dispatchMinionRecruited({
                        minionId: minion.id,
                        pool: minion.pool,
                        combatClass: minion.combatClass,
                      });
                      onClose();
                    }}
                  >
                    확인
                  </GameBtn>
                )}
                <GameBtn variant="ghost" onClick={onClose}>
                  닫기
                </GameBtn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
