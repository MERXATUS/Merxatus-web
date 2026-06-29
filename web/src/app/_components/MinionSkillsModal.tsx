"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { GameBtn, GamePanelTitle } from "@/app/_components/gameUi";
import { MinionSkillsPanel } from "@/app/_components/MinionSkillsPanel";
import type { MinionSkillView } from "@/shared/minionSkills";
import { useEscapeClose } from "@/shared/useEscapeClose";

type MinionSkillsModalProps = {
  open: boolean;
  minionId: string;
  combatClassLabel: string;
  displayName?: string;
  level: number;
  skills: MinionSkillView[];
  unspentSkillPoints: number;
  busy?: boolean;
  onClose: () => void;
  onApply?: (skills: Record<string, number>) => void | Promise<void>;
  onReset?: () => void | Promise<void>;
};

export function MinionSkillsModal({
  open,
  minionId,
  combatClassLabel,
  displayName,
  level,
  skills,
  unspentSkillPoints,
  busy,
  onClose,
  onApply,
  onReset,
}: MinionSkillsModalProps) {
  useEscapeClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined" || skills.length === 0) return null;

  return createPortal(
    <div
      className="minion-skills-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="minion-skills-modal-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="game-panel minion-skills-modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="minion-skills-modal__header">
          <GamePanelTitle id="minion-skills-modal-title">
            스킬 · {displayName ?? combatClassLabel} Lv {level}
          </GamePanelTitle>
          <GameBtn variant="ghost" className="minion-skills-modal__close" onClick={onClose} disabled={!!busy}>
            닫기
          </GameBtn>
        </div>
        <div className="minion-skills-modal__body">
          <MinionSkillsPanel
            minionId={minionId}
            skills={skills}
            unspentSkillPoints={unspentSkillPoints}
            busy={busy}
            onApply={onApply}
            onReset={onReset}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
